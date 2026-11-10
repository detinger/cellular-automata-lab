export interface AjvError {
  instancePath: string;
  keyword: string;
  message?: string;
  params: Record<string, unknown>;
}
declare const validate: ((data: unknown) => boolean) & { errors?: AjvError[] | null };
export default validate;
