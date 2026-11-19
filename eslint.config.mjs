import js from "@eslint/js";
import globals from "globals";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";

export default [
    { ignores: ["build/", "coverage/", "deps-report/", "node_modules/"] },
    js.configs.recommended,
    ...tseslint.configs["flat/recommended"],
    {
        languageOptions: {
            parser: tsparser,
            ecmaVersion: "latest",
            sourceType: "module",
            globals: { ...globals.node, ...globals.es2021 },
        },
        rules: {
            "linebreak-style": ["error", "unix"],
            "quotes": ["error", "double"],
            "semi": ["error", "always"],
        },
    },
];
