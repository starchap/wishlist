import nxPlugin from '@nx/eslint-plugin';

// Strict DDD Module Boundary Rules for Nx
export default [
  {
    files: ['**/*.ts', '**/*.tsx'],
    plugins: {
      '@nx': nxPlugin
    },
    rules: {
      '@nx/enforce-module-boundaries': [
        'error',
        {
          enforceBuildableLibDependency: true,
          allow: [],
          depConstraints: [
            {
              sourceTag: 'type:app',
              onlyDependOnLibsWithTags: ['type:domain', 'type:shared', 'type:ui']
            },
            {
              sourceTag: 'type:domain',
              onlyDependOnLibsWithTags: ['type:shared', 'type:domain']
            },
            {
              sourceTag: 'type:shared',
              onlyDependOnLibsWithTags: ['type:shared', 'type:ui']
            }
          ]
        }
      ]
    }
  }
];
