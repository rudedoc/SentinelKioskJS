import type { KioskAPI } from '@kioskos/shared-types';

declare global {
  interface Window {
    kioskAPI: KioskAPI;
  }
}
