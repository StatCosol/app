import 'reflect-metadata';
import { NotFoundException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AssistRecallGuard } from './assist-recall.guard';
import { LegitxAssistantController } from './legitx-assistant.controller';
describe('Assist recall', () => {
  it('returns not found instead of executing Assist', () => {
    expect(() => new AssistRecallGuard().canActivate()).toThrow(
      NotFoundException,
    );
  });
  it('guards every Assist controller route', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, LegitxAssistantController),
    ).toContain(AssistRecallGuard);
  });
});
