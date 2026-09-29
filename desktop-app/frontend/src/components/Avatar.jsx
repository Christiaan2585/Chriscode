import React from "react";

const SIZES = {
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-16 w-16 text-xl",
  xl: "h-24 w-24 text-3xl",
};

export const initialsOf = (name) =>
  (name || "?").split(" ").filter(Boolean).map((p) => p[0]).slice(0, 2).join("").toUpperCase() || "?";

// A user's photo (their own upload, else their Google picture), or their
// initials when they have neither. `user` needs name and avatar_url.
const Avatar = ({ user, size = "sm", className = "" }) =>
  user?.avatar_url ? (
    <img src={user.avatar_url} alt="" className={`${SIZES[size]} shrink-0 rounded-full object-cover ${className}`} />
  ) : (
    <div aria-hidden="true" className={`${SIZES[size]} flex shrink-0 items-center justify-center rounded-full bg-emerald-100 font-bold text-emerald-800 ${className}`}>
      {initialsOf(user?.name)}
    </div>
  );

export default Avatar;
