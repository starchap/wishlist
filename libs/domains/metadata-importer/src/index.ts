import { defineDomainI18n } from '@wishlist/i18n';
import daMetadataImporter from './lib/i18n/da.json';
import enMetadataImporter from './lib/i18n/en.json';

export const metadataImporterI18n = defineDomainI18n('metadataImporter', {
  da: daMetadataImporter,
  en: enMetadataImporter
});

export * from './lib/application/MetadataImporterService';
