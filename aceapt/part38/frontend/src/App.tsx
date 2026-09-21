import { useMemo } from "react";
import { MyProfessionalPosition } from "./components/MyProfessionalPosition";

/**
 * There is no real session or target-role-selection UI here yet (that's
 * Feature 34's job). For this standalone preview, studentId/roleId come from
 * the URL so the page is runnable on its own — wire this up to your real
 * auth/session and role selector when this is mounted into ACEAPT proper.
 */
export default function App() {
  const { studentId, roleId, isDemo } = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const paramStudentId = params.get("studentId");
    const paramRoleId = params.get("roleId");
    return {
      studentId: paramStudentId ?? "demo-student",
      roleId: paramRoleId ?? "role-backend",
      isDemo: !paramStudentId && !paramRoleId,
    };
  }, []);

  return (
    <>
      {isDemo && (
        <div className="demo-banner">
          Demo mode — showing studentId=demo-student, roleId=role-backend (run the backend with SEED_DEMO_DATA=true)
        </div>
      )}
      <MyProfessionalPosition studentId={studentId} roleId={roleId} />
    </>
  );
}
