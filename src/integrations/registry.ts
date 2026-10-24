import type { ICloudStorageProvider } from './provider.interface';

class ProviderRegistry {
  private providers = new Map<string, ICloudStorageProvider>();

  register(provider: ICloudStorageProvider) {
    this.providers.set(provider.name.toLowerCase(), provider);
  }

  get(name: string): ICloudStorageProvider {
    const provider = this.providers.get(name.toLowerCase());

    if (!provider) {
      throw new Error(`Provider ${name} is not supported`);
    }

    return provider;
  }

  getSupportedProviders(): string[] {
    return Array.from(this.providers.keys());
  }
}

export const providerRegistry = new ProviderRegistry();
