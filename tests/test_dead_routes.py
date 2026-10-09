"""Routes that let a program's headcounts change without the 'accepted quote locks the program' rule
(and that no screen used) were removed; the lock-aware PUT /programs/{id}/counts is the only way."""
import unittest

from app.api import programs


class LegacyGroupRoutesTests(unittest.TestCase):
    def test_headcounts_can_only_be_changed_through_the_locked_counts_route(self):
        paths = {(m, r.path) for r in programs.router.routes for m in getattr(r, "methods", ())}
        self.assertNotIn(("POST", "/programs/{program_id}/groups"), paths)
        self.assertNotIn(("GET", "/programs/{program_id}/groups"), paths)
        self.assertNotIn(("DELETE", "/programs/groups/{group_id}"), paths)
        self.assertIn(("PUT", "/programs/{program_id}/counts"), paths)


if __name__ == "__main__":
    unittest.main()
