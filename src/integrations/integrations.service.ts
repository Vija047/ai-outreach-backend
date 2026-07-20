import { Injectable } from '@nestjs/common';

@Injectable()
export class IntegrationsService {
  getStatus() {
    return {
      gmail: { enabled: false, message: 'Coming soon' },
      outlook: { enabled: false, message: 'Coming soon' },
      crm: { enabled: false, message: 'Coming soon' },
    };
  }
}
