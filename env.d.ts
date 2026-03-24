/// <reference types="@rsbuild/core/types" />

declare module '*.module.scss' {
  const classes: { [key: string]: string };
  export default classes;
}

declare module '*.scss';
declare module '*.css';
