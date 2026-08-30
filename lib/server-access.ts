import { contextFromRow } from './access-control.mjs';
import { bindMicrosoftId, findUser } from './db';
import { verifyMicrosoftIdentity } from './microsoft';

export async function requireAccessContext(request: Request) {
  const identity = await verifyMicrosoftIdentity(request);
  let row = await findUser(identity.email);
  if (!row || !row.active) throw new Error('FORBIDDEN');
  if (row.microsoft_id && row.microsoft_id !== identity.id) throw new Error('FORBIDDEN');
  if (!row.microsoft_id) {
    await bindMicrosoftId(row.id, identity.id);
    row = await findUser(identity.email);
    if (!row || row.microsoft_id !== identity.id) throw new Error('FORBIDDEN');
  }
  const context = contextFromRow({ ...row, name: row.name || identity.name });
  if (!context) throw new Error('FORBIDDEN');
  return context;
}

export async function requireAdministrator(request: Request) {
  const context = await requireAccessContext(request);
  if (!context.administrator) throw new Error('FORBIDDEN');
  return context;
}
