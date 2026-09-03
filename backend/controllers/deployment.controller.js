const Deployment   = require('../models/Deployment');
const Service      = require('../models/Service');
const User         = require('../models/User');
const k8sService   = require('../services/k8s.service');
const { emitEvent } = require('../services/socket.service');
const { parseRepoUrl, triggerWorkflowDispatch, getLatestWorkflowRuns } = require('../services/github.service');
const logger       = require('../config/logger');
const axios        = require('axios');

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000';

// Background poll for GitHub Actions workflow status
const pollWorkflowStatus = async (deploymentId, accessToken, owner, repo, triggeredAt) => {
  let attempts = 0;
  const maxAttempts = 30;

  const interval = setInterval(async () => {
    attempts++;
    try {
      const runs     = await getLatestWorkflowRuns(accessToken, owner, repo);
      const targetRun = runs.find(r => new Date(r.created_at) >= new Date(triggeredAt.getTime() - 15000));

      if (!targetRun) {
        if (attempts >= maxAttempts) clearInterval(interval);
        return;
      }

      const deployment = await Deployment.findById(deploymentId).populate('service');
      if (!deployment) { clearInterval(interval); return; }

      let buildStatus =
        targetRun.status === 'completed'
          ? targetRun.conclusion === 'success' ? 'success' : 'failed'
          : 'building';

      deployment.buildStatus  = buildStatus;
      deployment.githubRunId  = String(targetRun.id);

      if (buildStatus === 'success') {
        clearInterval(interval);
        deployment.deployStatus = 'deploying';
        await deployment.save();
        emitEvent('deployment:update', { deploymentId, buildStatus: 'success', deployStatus: 'deploying', deployment });

        try {
          await k8sService.deployService({
            deploymentName: deployment.service?.deploymentName,
            namespace:      deployment.service?.namespace,
            imageName:      deployment.service?.imageName || `${deployment.service?.name}:latest`,
          });
          deployment.deployStatus = 'running';
          deployment.service.status = 'running';
          await deployment.service.save();
        } catch (k8sErr) {
          logger.error(`[deployment] K8s deploy failed: ${k8sErr.message}`);
          deployment.deployStatus = 'failed';
        }

        await deployment.save();
        emitEvent('deployment:update', { deploymentId, buildStatus: 'success', deployStatus: deployment.deployStatus, deployment });

      } else if (buildStatus === 'failed') {
        clearInterval(interval);
        deployment.deployStatus = 'failed';

        // Auto-score failure with XGBoost
        try {
          const predRes = await axios.post(`${AI_SERVICE_URL}/predict`, {
            build_duration: deployment.duration || 0,
            build_status:   1,
            deploy_status:  1,
            commit_sha_len: (deployment.commitSha || '').length,
            retry_count:    0,
          }, { timeout: 5000 });
          deployment.failureScore = predRes.data?.failure_probability;
        } catch { /* non-critical */ }

        await deployment.save();
        emitEvent('deployment:update', { deploymentId, buildStatus: 'failed', deployStatus: 'failed', deployment });

      } else {
        await deployment.save();
        emitEvent('deployment:update', { deploymentId, buildStatus: 'building', deployStatus: deployment.deployStatus, deployment });
      }

      if (attempts >= maxAttempts) clearInterval(interval);
    } catch (err) {
      logger.error(`[deployment] poll error: ${err.message}`);
      if (attempts >= maxAttempts) clearInterval(interval);
    }
  }, 10_000);
};

const triggerDeployment = async (req, res, next) => {
  try {
    const { serviceId, commitSha, commitMessage, branch } = req.body;

    const service = await Service.findById(serviceId);
    if (!service) return res.status(404).json({ message: 'Service not found' });

    const deployment = await Deployment.create({
      service:       serviceId,
      triggeredBy:   req.user.id,
      commitSha,
      commitMessage,
      branch:        branch || 'main',
      buildStatus:   'queued',
      deployStatus:  'pending',
    });

    emitEvent('deployment:update', { deploymentId: deployment._id, buildStatus: 'queued', deployStatus: 'pending', deployment });

    const user     = await User.findById(req.user.id).select('+accessToken');
    const repoInfo = parseRepoUrl(service.repoUrl);

    if (user?.accessToken && repoInfo) {
      const triggeredAt = new Date();
      triggerWorkflowDispatch(user.accessToken, repoInfo.owner, repoInfo.repo)
        .then(() => pollWorkflowStatus(deployment._id, user.accessToken, repoInfo.owner, repoInfo.repo, triggeredAt))
        .catch(err => logger.error(`[deployment] workflow_dispatch failed: ${err.message}`));
    }

    res.status(201).json(deployment);
  } catch (err) {
    next(err);
  }
};

const getDeployments = async (req, res, next) => {
  try {
    const { serviceId, buildStatus, deployStatus, limit = 50 } = req.query;
    const filter = {};
    if (serviceId)    filter.service      = serviceId;
    if (buildStatus)  filter.buildStatus  = buildStatus;
    if (deployStatus) filter.deployStatus = deployStatus;

    const deployments = await Deployment.find(filter)
      .populate('service triggeredBy')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));

    res.json(deployments);
  } catch (err) {
    next(err);
  }
};

const getDeploymentStatus = async (req, res, next) => {
  try {
    const deployment = await Deployment.findById(req.params.id).populate('service');
    if (!deployment) return res.status(404).json({ message: 'Deployment not found' });

    let liveStatus = null;
    try {
      liveStatus = await k8sService.getDeploymentStatus({
        deploymentName: deployment.service.deploymentName,
        namespace:      deployment.service.namespace,
      });
    } catch { /* k8s may not be available */ }

    res.json({ deployment, liveStatus });
  } catch (err) {
    next(err);
  }
};

module.exports = { triggerDeployment, getDeployments, getDeploymentStatus };
