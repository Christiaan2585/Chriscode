import React from "react";
import { passwordProblems } from "../utils/passwordRules";

// Under a "new password" box: what a good password needs, ticking off as you type.
const PasswordHint = ({ password, email, name }) => {
  const problems = passwordProblems(password, { email, name });
  return (
    <p className={`mt-1 text-xs ${password && problems.length === 0 ? "text-emerald-700" : "text-slate-500"}`}>
      {password && problems.length === 0
        ? "Looks good."
        : `A good password: ${problems.length ? problems.join(", ") : "at least 10 characters"}. A few words strung together works well.`}
    </p>
  );
};

export default PasswordHint;
