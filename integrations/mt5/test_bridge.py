import tempfile
import unittest
from pathlib import Path

from bridge import parse_snapshot


class SnapshotTest(unittest.TestCase):
    def test_parses_account_and_optional_gross_pnl(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "deals.tsv"
            path.write_text(
                "login\tserver\tcurrency\tticket\tposition_id\torder\tsymbol\tside\tquantity\tprice\tfee\texecuted_at\treported_gross_pnl\n"
                "123\tBroker-Demo\tUSD\t1\t9\t0\tEURUSD\tbuy\t1\t1.1\t2\t2026-01-01T00:00:00.123Z\t\n"
                "123\tBroker-Demo\tUSD\t2\t9\t1\tEURUSD\tsell\t1\t1.2\t3\t2026-01-01T01:00:00.456Z\t50\n"
            )
            account, deals = parse_snapshot(path)
            self.assertEqual(account, {"login": "123", "server": "Broker-Demo", "currency": "USD"})
            self.assertNotIn("reportedGrossPnl", deals[0])
            self.assertEqual(deals[1]["reportedGrossPnl"], 50)


if __name__ == "__main__":
    unittest.main()
