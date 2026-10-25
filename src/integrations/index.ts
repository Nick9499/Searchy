import { GoogleDriveProvider } from './google/google.provider';
import { providerRegistry } from './registry';

providerRegistry.register(new GoogleDriveProvider());

export { providerRegistry };
export * from './provider.interface';
