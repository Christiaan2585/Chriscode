// What changed, in plain words, for the one-time "What's new" window after an update (components/WhatsNew.jsx).
// Add an entry for every release - `version` must match version.json - newest first. Keep it short and about what
// people will notice. (Never put the business's program steps, products or doses here: the repository is public.)
export const NOTES = [
  {
    version: "1.0.10",
    title: "A calmer look, safer sign-in and the phone works offline",
    sections: [
      {
        heading: "New",
        items: [
          "Five colour schemes taken from the farm (Settings > General > Appearance), easier on the eyes in light and dark.",
          "Your name and phone number show under the logo as the sales rep; Lock and Sign out are now in Settings > My Details.",
          "Ram ear-tag numbers on each client's page, and the top search finds a ram by its tag.",
          "A new header animation: sheep, cow, collie and a Land Cruiser bakkie.",
          "Android: the phone keeps a copy of the office data, works without the office Wi-Fi, and catches up when it is back.",
        ],
      },
      {
        heading: "Safer",
        items: [
          "Only admins can delete clients, invoices, quotes, orders, products and programs.",
          "Wrong-password guessing is limited properly, and a temporary password can only be used to choose a new one.",
          "The \"remember this device\" sign-in is locked with Windows' own encryption.",
          "A phone not used for 90 days has to be paired again.",
        ],
      },
      {
        heading: "Tidier",
        items: ["A smaller installer, and a few old features nothing used were removed."],
      },
    ],
  },
];
