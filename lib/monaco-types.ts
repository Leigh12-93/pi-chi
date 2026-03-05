/** Configure Monaco editor with TypeScript type definitions for better intellisense */

let typesLoaded = false

export function setupMonacoTypes(monaco: any) {
  if (typesLoaded) return
  typesLoaded = true

  const ts = monaco.languages.typescript

  // Configure TypeScript compiler options
  ts.typescriptDefaults.setCompilerOptions({
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    jsx: ts.JsxEmit.ReactJSX,
    allowJs: true,
    checkJs: false,
    strict: true,
    esModuleInterop: true,
    skipLibCheck: true,
    forceConsistentCasingInFileNames: true,
    resolveJsonModule: true,
    isolatedModules: true,
    noEmit: true,
    allowImportingTsExtensions: true,
    baseUrl: '.',
    paths: {
      '@/*': ['./*'],
    },
  })

  // Enable automatic type acquisition
  ts.typescriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: false,
    noSyntaxValidation: false,
  })

  // Add React type definitions
  const reactTypes = `
declare module 'react' {
  export function useState<T>(initialState: T | (() => T)): [T, (value: T | ((prev: T) => T)) => void];
  export function useEffect(effect: () => void | (() => void), deps?: any[]): void;
  export function useCallback<T extends (...args: any[]) => any>(callback: T, deps: any[]): T;
  export function useMemo<T>(factory: () => T, deps: any[]): T;
  export function useRef<T>(initialValue: T): { current: T };
  export function useContext<T>(context: React.Context<T>): T;
  export function createContext<T>(defaultValue: T): React.Context<T>;
  export function forwardRef<T, P = {}>(render: (props: P, ref: React.Ref<T>) => React.ReactElement | null): React.ForwardRefExoticComponent<P & React.RefAttributes<T>>;
  export function memo<P extends object>(component: React.FC<P>): React.FC<P>;
  export type FC<P = {}> = (props: P) => React.ReactElement | null;
  export type ReactNode = React.ReactElement | string | number | boolean | null | undefined;
  export type ReactElement = any;
  export type Ref<T> = ((instance: T | null) => void) | { current: T | null } | null;
  export type RefAttributes<T> = { ref?: Ref<T> };
  export type ForwardRefExoticComponent<P> = React.FC<P>;
  export type Context<T> = { Provider: FC<{ value: T; children?: ReactNode }>; Consumer: FC<{ children: (value: T) => ReactNode }> };
  export type ChangeEvent<T = Element> = { target: T & { value: string }; preventDefault(): void };
  export type FormEvent<T = Element> = { preventDefault(): void; currentTarget: T };
  export type MouseEvent<T = Element> = { preventDefault(): void; stopPropagation(): void; target: T; clientX: number; clientY: number };
  export type KeyboardEvent<T = Element> = { key: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; preventDefault(): void };
  export namespace React {
    export type FC<P = {}> = (props: P) => ReactElement | null;
    export type ReactNode = ReactElement | string | number | boolean | null | undefined;
    export type ReactElement = any;
  }
}

declare module 'next/link' {
  import { FC, ReactNode } from 'react';
  interface LinkProps { href: string; className?: string; children?: ReactNode; target?: string; rel?: string; }
  const Link: FC<LinkProps>;
  export default Link;
}

declare module 'next/image' {
  import { FC } from 'react';
  interface ImageProps { src: string; alt: string; width?: number; height?: number; fill?: boolean; className?: string; priority?: boolean; }
  const Image: FC<ImageProps>;
  export default Image;
}

declare module 'next/navigation' {
  export function useRouter(): { push(url: string): void; back(): void; replace(url: string): void; refresh(): void; };
  export function usePathname(): string;
  export function useSearchParams(): URLSearchParams;
  export function useParams(): Record<string, string>;
}
`

  ts.typescriptDefaults.addExtraLib(reactTypes, 'file:///node_modules/@types/react/index.d.ts')
}
