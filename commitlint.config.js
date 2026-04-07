module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      [
        'build',
        'chore',
        'ci',
        'docs',
        'feat',
        'fix',
        'perf',
        'release',
        'refactor',
        'revert',
        'style',
        'test',
      ],
    ],
    'scope-enum': [
      1,
      'always',
      [
        'admin-search',
        'alt-text',
        'astro-payload-richtext-lexical',
        'cloudinary',
        'content-translator',
        'geocoding',
        'pages',
        'vercel-deployments',
      ],
    ],
  },
}
