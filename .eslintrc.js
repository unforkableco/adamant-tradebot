module.exports = {
  env: {
    commonjs: true,
    es2021: true,
    node: true,
    mocha: true
  },
  extends: [
    'eslint:recommended',
    'google',
  ],
  parser: '@babel/eslint-parser',
  parserOptions: {
    ecmaVersion: 12,
  },
  rules: {
    quotes: ['error', 'single'],
    'prefer-arrow-callback': ['error'],
    'object-shorthand': ['error', 'always'],
    'quote-props': ['error', 'as-needed'],
    'object-curly-spacing': ['error', 'always'],
    'max-len': ['error',
      { code: 133,
        ignoreTrailingComments: true,
        ignoreComments: true,
        ignoreUrls: true,
        ignoreStrings: true,
        ignoreTemplateLiterals: true,
        ignoreRegExpLiterals: true,
      }],
    'require-jsdoc': ['off'],
    'valid-jsdoc': ['off'],
    'no-array-constructor': ['off'],
    'no-caller': ['off'],
    'prefer-promise-reject-errors': ['off'],
    'guard-for-in': ['off'],
    'padded-blocks': ['off'],
    'new-cap': ['off'],
    camelcase: ['off'],
    eqeqeq: ['error', 'always'],
  },
};
