/**
 * Kubernetes Service — real @kubernetes/client-node integration
 *
 * Supports:
 *   - Deploy a service (create or patch Deployment + Service)
 *   - Restart a deployment (rolling restart via pod-template annotation patch)
 *   - Rollback a deployment (revert to previous ReplicaSet revision)
 *   - Scale a deployment (patch spec.replicas)
 *   - Get live deployment status (available replicas, conditions, pod list)
 *   - Stream pod logs
 *   - Watch deployment events
 *
 * Config: reads ~/.kube/config by default (works with minikube / kind).
 * Override via KUBECONFIG env var or IN_CLUSTER=true for pod-mounted SA token.
 */

const k8s = require('@kubernetes/client-node');

// ─── client setup ────────────────────────────────────────────────────────────

const kc = new k8s.KubeConfig();

if (process.env.IN_CLUSTER === 'true') {
  kc.loadFromCluster();
} else {
  kc.loadFromDefault(); // reads KUBECONFIG or ~/.kube/config
}

const appsApi  = kc.makeApiClient(k8s.AppsV1Api);
const coreApi  = kc.makeApiClient(k8s.CoreV1Api);
const logApi   = kc.makeApiClient(k8s.CoreV1Api);

// ─── helpers ─────────────────────────────────────────────────────────────────

const DEFAULT_NS = process.env.K8S_DEFAULT_NAMESPACE || 'default';

/** Wrap k8s API calls and normalise errors into plain messages */
const k8sCall = async (fn) => {
  try {
    return await fn();
  } catch (err) {
    const body = err?.response?.body;
    const msg  = (typeof body === 'object' ? body?.message : body) || err.message;
    throw new Error(`[k8s.service] ${msg}`);
  }
};

// ─── exported functions ───────────────────────────────────────────────────────

/**
 * Deploy a service: applies a Deployment + ClusterIP Service.
 * Creates if absent, patches (strategic merge) if already exists.
 */
const deployService = async ({ deploymentName, namespace = DEFAULT_NS, imageName, replicas = 2, port = 80 }) => {
  const labels = { app: deploymentName };

  const deploymentManifest = {
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: { name: deploymentName, namespace },
    spec: {
      replicas,
      selector: { matchLabels: labels },
      template: {
        metadata: { labels },
        spec: {
          containers: [{
            name: deploymentName,
            image: imageName,
            ports: [{ containerPort: port }],
            resources: {
              requests: { cpu: '100m', memory: '128Mi' },
              limits:   { cpu: '500m', memory: '512Mi' },
            },
            livenessProbe: {
              httpGet: { path: '/healthz', port },
              initialDelaySeconds: 15,
              periodSeconds: 20,
            },
          }],
        },
      },
    },
  };

  const svcManifest = {
    apiVersion: 'v1',
    kind: 'Service',
    metadata: { name: deploymentName, namespace },
    spec: {
      selector: labels,
      ports: [{ port: 80, targetPort: port }],
      type: 'ClusterIP',
    },
  };

  // Try create first; if 409 (already exists) fall back to patch
  await k8sCall(async () => {
    try {
      await appsApi.createNamespacedDeployment(namespace, deploymentManifest);
    } catch (e) {
      if (e?.response?.body?.code === 409) {
        await appsApi.patchNamespacedDeployment(
          deploymentName, namespace, deploymentManifest,
          undefined, undefined, undefined, undefined,
          { headers: { 'Content-Type': 'application/strategic-merge-patch+json' } }
        );
      } else throw e;
    }
  });

  await k8sCall(async () => {
    try {
      await coreApi.createNamespacedService(namespace, svcManifest);
    } catch (e) {
      if (e?.response?.body?.code !== 409) throw e;
    }
  });

  return { status: 'deployed', deploymentName, namespace, imageName };
};

/**
 * Rolling restart — patches the pod-template annotation with current timestamp,
 * which forces Kubernetes to cycle pods without changing the image.
 * Equivalent to: kubectl rollout restart deployment/<name>
 */
const restartDeployment = async ({ deploymentName, namespace = DEFAULT_NS }) => {
  const patch = {
    spec: {
      template: {
        metadata: {
          annotations: {
            'kubectl.kubernetes.io/restartedAt': new Date().toISOString(),
          },
        },
      },
    },
  };

  await k8sCall(() =>
    appsApi.patchNamespacedDeployment(
      deploymentName, namespace, patch,
      undefined, undefined, undefined, undefined,
      { headers: { 'Content-Type': 'application/strategic-merge-patch+json' } }
    )
  );

  return { status: 'restarted', deploymentName, namespace };
};

/**
 * Rollback — finds the previous ReplicaSet revision and patches the deployment
 * to match its pod template spec, then triggers a rollout.
 */
const rollbackDeployment = async ({ deploymentName, namespace = DEFAULT_NS }) => {
  // List ReplicaSets owned by this Deployment, sorted by revision
  const rsListRes = await k8sCall(() =>
    appsApi.listNamespacedReplicaSet(namespace, undefined, undefined, undefined,
      undefined, `app=${deploymentName}`)
  );

  const rsList = (rsListRes.body.items || [])
    .filter(rs => (rs.metadata?.annotations?.['deployment.kubernetes.io/revision']))
    .sort((a, b) =>
      parseInt(b.metadata.annotations['deployment.kubernetes.io/revision']) -
      parseInt(a.metadata.annotations['deployment.kubernetes.io/revision'])
    );

  if (rsList.length < 2) {
    throw new Error(`[k8s.service] No previous revision found for ${deploymentName}`);
  }

  const previousRS   = rsList[1]; // second-newest = previous
  const previousSpec = previousRS.spec.template;

  const patch = { spec: { template: previousSpec } };

  await k8sCall(() =>
    appsApi.patchNamespacedDeployment(
      deploymentName, namespace, patch,
      undefined, undefined, undefined, undefined,
      { headers: { 'Content-Type': 'application/strategic-merge-patch+json' } }
    )
  );

  return { status: 'rolled_back', deploymentName, namespace, toRevision: previousRS.metadata.annotations['deployment.kubernetes.io/revision'] };
};

/**
 * Scale a deployment by patching spec.replicas.
 */
const scaleDeployment = async ({ deploymentName, namespace = DEFAULT_NS, replicas }) => {
  const patch = { spec: { replicas } };

  await k8sCall(() =>
    appsApi.patchNamespacedDeployment(
      deploymentName, namespace, patch,
      undefined, undefined, undefined, undefined,
      { headers: { 'Content-Type': 'application/merge-patch+json' } }
    )
  );

  return { status: 'scaled', deploymentName, namespace, replicas };
};

/**
 * Get live deployment status: available replicas, conditions, and running pods.
 */
const getDeploymentStatus = async ({ deploymentName, namespace = DEFAULT_NS }) => {
  const depRes = await k8sCall(() =>
    appsApi.readNamespacedDeployment(deploymentName, namespace)
  );

  const dep    = depRes.body;
  const status = dep.status || {};

  const podRes = await k8sCall(() =>
    coreApi.listNamespacedPod(namespace, undefined, undefined, undefined,
      undefined, `app=${deploymentName}`)
  );

  const pods = (podRes.body.items || []).map(pod => ({
    name:     pod.metadata.name,
    phase:    pod.status.phase,
    ready:    pod.status.containerStatuses?.[0]?.ready ?? false,
    restarts: pod.status.containerStatuses?.[0]?.restartCount ?? 0,
    node:     pod.spec.nodeName,
  }));

  return {
    deploymentName,
    namespace,
    desired:   dep.spec.replicas,
    ready:     status.readyReplicas     ?? 0,
    available: status.availableReplicas ?? 0,
    updated:   status.updatedReplicas   ?? 0,
    conditions: (status.conditions || []).map(c => ({
      type:    c.type,
      status:  c.status,
      reason:  c.reason,
      message: c.message,
    })),
    pods,
    overallHealth: status.availableReplicas >= dep.spec.replicas ? 'healthy' : 'degraded',
  };
};

/**
 * Fetch the last N lines of logs from the most-recently-started pod
 * of a given deployment. Used by the AI RCA pipeline.
 */
const getPodLogs = async ({ deploymentName, namespace = DEFAULT_NS, tailLines = 200 }) => {
  const podRes = await k8sCall(() =>
    coreApi.listNamespacedPod(namespace, undefined, undefined, undefined,
      undefined, `app=${deploymentName}`)
  );

  const pods = podRes.body.items || [];
  if (!pods.length) throw new Error(`[k8s.service] No pods found for ${deploymentName}`);

  // Pick the most recently started pod
  const pod = pods.sort((a, b) =>
    new Date(b.status.startTime) - new Date(a.status.startTime)
  )[0];

  const logRes = await k8sCall(() =>
    logApi.readNamespacedPodLog(
      pod.metadata.name,
      namespace,
      undefined,     // container (first by default)
      undefined,     // follow
      undefined,     // insecureSkipTLSVerifyBackend
      undefined,     // limitBytes
      undefined,     // pretty
      undefined,     // previous
      undefined,     // sinceSeconds
      tailLines,
    )
  );

  return { podName: pod.metadata.name, logs: logRes.body };
};

/**
 * List all namespaces — useful for the dashboard service browser.
 */
const listNamespaces = async () => {
  const res = await k8sCall(() => coreApi.listNamespace());
  return (res.body.items || []).map(ns => ns.metadata.name);
};

/**
 * List all deployments in a namespace.
 */
const listDeployments = async ({ namespace = DEFAULT_NS } = {}) => {
  const res = await k8sCall(() => appsApi.listNamespacedDeployment(namespace));
  return (res.body.items || []).map(dep => ({
    name:      dep.metadata.name,
    namespace: dep.metadata.namespace,
    desired:   dep.spec.replicas,
    ready:     dep.status.readyReplicas   ?? 0,
    available: dep.status.availableReplicas ?? 0,
    image:     dep.spec.template.spec.containers[0]?.image,
  }));
};

module.exports = {
  deployService,
  restartDeployment,
  rollbackDeployment,
  scaleDeployment,
  getDeploymentStatus,
  getPodLogs,
  listNamespaces,
  listDeployments,
};
