const router = require('express').Router();
const { protect } = require('../middleware/auth.middleware');
const Service = require('../models/Service');
const k8sService = require('../services/k8s.service');

// List all services
router.get('/', protect, async (req, res, next) => {
  try {
    const services = await Service.find().populate('owner').sort({ createdAt: -1 });
    res.json(services);
  } catch (err) { next(err); }
});

// Create a service
router.post('/', protect, async (req, res, next) => {
  try {
    const service = await Service.create({ ...req.body, owner: req.user.id });
    res.status(201).json(service);
  } catch (err) { next(err); }
});

// Get a single service with live K8s status
router.get('/:id', protect, async (req, res, next) => {
  try {
    const service = await Service.findById(req.params.id).populate('owner');
    if (!service) return res.status(404).json({ message: 'Service not found' });

    let liveStatus = null;
    try {
      liveStatus = await k8sService.getDeploymentStatus({
        deploymentName: service.deploymentName,
        namespace:      service.namespace,
      });
    } catch { /* offline/dev */ }

    res.json({ service, liveStatus });
  } catch (err) { next(err); }
});

// Get pod logs for a service
router.get('/:id/logs', protect, async (req, res, next) => {
  try {
    const service = await Service.findById(req.params.id);
    if (!service) return res.status(404).json({ message: 'Service not found' });

    const { tailLines = 200 } = req.query;
    const logs = await k8sService.getPodLogs({
      deploymentName: service.deploymentName,
      namespace:      service.namespace,
      tailLines:      parseInt(tailLines),
    });
    res.json(logs);
  } catch (err) { next(err); }
});

// Update a service
router.patch('/:id', protect, async (req, res, next) => {
  try {
    const service = await Service.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!service) return res.status(404).json({ message: 'Service not found' });
    res.json(service);
  } catch (err) { next(err); }
});

module.exports = router;
