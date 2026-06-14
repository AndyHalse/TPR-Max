import { simpleDatabaseService } from '../simpleDatabaseService';

export const requireHrFeature = async (req: any, res: any, next: any) => {
  try {
    if (!req.user || !req.customerId) return res.status(401).json({ error: 'Unauthorized' });
    const context = simpleDatabaseService.createCustomerContext(req.user.username, req.customerId);
    const settings = await simpleDatabaseService.getCompanySettings(context);
    if (!settings?.featureHrModule) {
      return res.status(403).json({
        error: 'The HR module requires a TPR Max subscription.',
        planRequired: 'tpr_max',
      });
    }
    next();
  } catch (error) {
    next(error);
  }
};
