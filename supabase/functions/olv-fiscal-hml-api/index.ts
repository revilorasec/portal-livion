import { createHandler } from '../../../olv-fiscal/handler.mjs';

// This function validates Microsoft identity and current Portal permissions through portal-api.
// The only business store is the OLV FISCAL/Homologacao folder in the corporate OneDrive.
// No production fiscal adapter, Access/ODBC, certificate, SEFAZ endpoint or migration is enabled.
Deno.serve(createHandler());
