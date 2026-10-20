import JSZip from 'npm:jszip@3.10.1';
import { createService } from './service.mjs';
import { runtimeDependencies } from './runtime.mjs';
Deno.serve(createService(runtimeDependencies(name => Deno.env.get(name), JSZip)));
