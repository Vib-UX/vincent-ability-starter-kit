import { defineBuildConfig } from 'unbuild';

export default defineBuildConfig({
  entries: [
    './src/index',
    {
      input: './src/lib/lit-action',
      outDir: './dist',
      name: 'lit-action',
    },
  ],
  declaration: true,
  clean: true,
  rollup: {
    emitCFS: false,
  },
});
