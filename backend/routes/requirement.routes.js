const router      = require('express').Router();
const { protect } = require('../middleware/auth.middleware');
const Requirement = require('../models/Requirement');

router.get('/', protect, async (req, res, next) => {
  try {
    const { serviceId } = req.query;
    const filter = serviceId ? { service: serviceId } : {};
    const reqs = await Requirement.find(filter).populate('service createdBy').sort({ createdAt: -1 });
    res.json(reqs);
  } catch (err) { next(err); }
});

router.post('/', protect, async (req, res, next) => {
  try {
    const req_ = await Requirement.create({ ...req.body, createdBy: req.user.id });
    res.status(201).json(req_);
  } catch (err) { next(err); }
});

router.patch('/:id', protect, async (req, res, next) => {
  try {
    const req_ = await Requirement.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!req_) return res.status(404).json({ message: 'Requirement not found' });
    res.json(req_);
  } catch (err) { next(err); }
});

module.exports = router;
