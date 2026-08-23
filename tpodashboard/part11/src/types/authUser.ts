/** The authenticated caller's effective, request-scoped identity and permissions. */
export interface AuthUser {
  id: string;
  institutionId: string;
  departmentId: string | null;
  email: string;
  name: string;
  role: string;
  rank: number;
  permissions: string[];
}
