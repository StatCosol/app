import { getMetadataArgsStorage } from 'typeorm';
import { ComplianceComment } from './entities/compliance-comment.entity';

describe('Compliance comment schema contract', () => {
  it('maps the public message property to the existing comment database column', () => {
    const column = getMetadataArgsStorage().columns.find(
      (item) =>
        item.target === ComplianceComment && item.propertyName === 'message',
    );
    expect(column?.options.name).toBe('comment');
    expect(column?.options.type).toBe('text');
  });
});
