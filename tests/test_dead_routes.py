"""Routes that let a program's headcounts change without the 'accepted quote locks the program' rule
(and that no screen used) were removed; the lock-aware PUT /programs/{id}/counts is the only way."""
import unittest

from app.api import clients, dosing, programs


class LegacyGroupRoutesTests(unittest.TestCase):
    def test_headcounts_can_only_be_changed_through_the_locked_counts_route(self):
        paths = {(m, r.path) for r in programs.router.routes for m in getattr(r, "methods", ())}
        self.assertNotIn(("POST", "/programs/{program_id}/groups"), paths)
        self.assertNotIn(("GET", "/programs/{program_id}/groups"), paths)
        self.assertNotIn(("DELETE", "/programs/groups/{group_id}"), paths)
        self.assertIn(("PUT", "/programs/{program_id}/counts"), paths)

    def test_the_old_animal_assignment_routes_are_gone(self):
        paths = {(m, r.path) for r in programs.router.routes for m in getattr(r, "methods", ())}
        for gone in (("POST", "/programs/assign"), ("GET", "/programs/{program_id}/animals"),
                     ("DELETE", "/programs/assign/{animal_id}/{program_id}")):
            self.assertNotIn(gone, paths)

    def test_the_unused_client_export_and_erase_routes_are_gone(self):
        paths = {r.path for r in clients.router.routes}
        self.assertNotIn("/clients/{client_id}/export", paths)
        self.assertNotIn("/clients/{client_id}/erase", paths)

    def test_dosing_rules_are_read_only(self):
        methods = {m for r in dosing.router.routes for m in getattr(r, "methods", ())} - {"HEAD", "OPTIONS"}
        self.assertEqual(methods, {"GET"})


if __name__ == "__main__":
    unittest.main()
