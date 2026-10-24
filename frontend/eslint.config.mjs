import next from 'eslint-config-next';

const config = [
  ...next,
  { ignores: ['.next/**', 'public/**', 'next-env.d.ts'] },
  {
    // Preserve the pre-upgrade checks. React Compiler is not enabled; adopting
    // its new effect/render restrictions is a separate application refactor.
    rules: {
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/immutability': 'off',
      'react-hooks/refs': 'off',
    },
  },
];

export default config;
