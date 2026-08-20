export type Embedder = {
  readonly name: string;
  readonly modelName: string;
  readonly dim: number;
  embed(texts: string[]): Promise<number[][]>;
  info(): Promise<{ modelName: string }>;
};
