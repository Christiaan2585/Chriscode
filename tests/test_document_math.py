import unittest

from types import SimpleNamespace

from app.core.documents import document_totals, format_number, line_amounts, next_number, price_pair


class PricePairTests(unittest.TestCase):
    def test_the_stored_price_excl_vat_is_used(self):
        self.assertEqual(price_pair(SimpleNamespace(price=455.69, price_excl_vat=396.25)), (396.25, 455.69))

    def test_without_one_it_is_worked_out_from_the_price_incl_vat(self):
        self.assertEqual(price_pair(SimpleNamespace(price=287.5, price_excl_vat=None)), (250.0, 287.5))
        self.assertEqual(price_pair(SimpleNamespace(price=110.0, price_excl_vat=None), vat_rate=10), (100.0, 110.0))

    def test_a_zero_vat_rate_means_the_same_price_twice(self):
        self.assertEqual(price_pair(SimpleNamespace(price=100.0, price_excl_vat=None), vat_rate=0), (100.0, 100.0))


class LineAmountTests(unittest.TestCase):
    def test_plain_line(self):
        self.assertEqual(
            line_amounts(7, 230.65),
            {"gross": 1614.55, "discount": 0.0, "exclusive": 1614.55, "vat": 0.0, "inclusive": 1614.55},
        )

    def test_discount_then_vat(self):
        # 2 x 100 = 200, 10% off = 180, 15% VAT on 180 = 27.
        self.assertEqual(
            line_amounts(2, 100, discount_percent=10, vat_percent=15),
            {"gross": 200.0, "discount": 20.0, "exclusive": 180.0, "vat": 27.0, "inclusive": 207.0},
        )

    def test_rounds_half_up_to_cents(self):
        # 3 x 0.125 = 0.375 -> 0.38 (not banker's 0.37)
        self.assertEqual(line_amounts(3, 0.125)["exclusive"], 0.38)

    def test_blank_discount_and_vat_count_as_zero(self):
        # Rows from before these columns existed hold NULL.
        self.assertEqual(line_amounts(1, 50, discount_percent=None, vat_percent=None)["inclusive"], 50.0)


class TotalsTests(unittest.TestCase):
    def test_matches_the_sage_example(self):
        lines = [line_amounts(7, 230.65), line_amounts(14, 230.65), line_amounts(210, 1.06)]
        self.assertEqual(
            document_totals(lines),
            {"total_discount": 0.0, "total_exclusive": 5066.25, "total_vat": 0.0, "grand_total": 5066.25},
        )

    def test_empty(self):
        self.assertEqual(document_totals([])["grand_total"], 0.0)


class NumberingTests(unittest.TestCase):
    def test_format_matches_sage(self):
        self.assertEqual(format_number("INV", 180), "INV0000180")

    def test_continues_after_highest_existing(self):
        self.assertEqual(next_number(["INV0000180", "INV0000007", None], "INV", start_from=1), "INV0000181")

    def test_start_from_wins_when_higher(self):
        self.assertEqual(next_number(["INV0000003"], "INV", start_from=181), "INV0000181")

    def test_ignores_other_prefixes_and_junk(self):
        self.assertEqual(next_number(["QUO0000900", "INVabc", "INV0000002"], "INV", start_from=1), "INV0000003")

    def test_first_number(self):
        self.assertEqual(next_number([], "PO", start_from=None), "PO0000001")


if __name__ == "__main__":
    unittest.main()
