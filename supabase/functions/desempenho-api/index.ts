import {createService, runtimeDependencies} from './service.mjs';
Deno.serve(createService(runtimeDependencies(name=>Deno.env.get(name))));
