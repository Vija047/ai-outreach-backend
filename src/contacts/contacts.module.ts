import { Module } from '@nestjs/common';
import { ContactDiscoveryService } from './contact-discovery.service';
import { ContactMergeService } from './contact-merge.service';
import { ContactsService } from './contacts.service';
import { HunterClient } from './hunter.client';
import { RocketReachClient } from './rocketreach.client';

@Module({
  providers: [
    RocketReachClient,
    HunterClient,
    ContactMergeService,
    ContactDiscoveryService,
    ContactsService,
  ],
  exports: [ContactDiscoveryService, ContactsService],
})
export class ContactsModule {}
