/** @type {import('esbuild-node-tsc/dist/config').Config} */
module.exports = {
  esbuild: {
    minify: false,
    format: 'esm',
    treeShaking: true,
    platform: 'node'
  },

  // Prebuild hook
  prebuild: async () => {
    console.log("Prebuild");
    const rimraf = await import("rimraf");
    rimraf.sync("./dist"); // clean up dist folder
  },

  // Postbuild hook
  postbuild: async () => {
    console.log("Postbuild");
    const cpy = (await import("cpy")).default;

    await cpy(
      [
        "src/**/*.{css,html,ejs,py}"
      ],
      "dist"
    );
  },
};