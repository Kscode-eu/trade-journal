#property copyright "Trade Journal contributors"
#property link      "https://github.com/LuxAlgo/trade-journal"
#property version   "1.00"
#property description "Read-only MT5 deal exporter for the Trade Journal Docker bridge."

input datetime InpHistoryFrom = D'2000.01.01 00:00';
input int InpExportIntervalSeconds = 60;

const string TEMP_FILE = "TradeJournalDeals.tmp";
const string EXPORT_FILE = "TradeJournalDeals.tsv";
int last_deal_count = -1;
long last_account_login = -1;

string IsoTime(const long time_msc)
  {
   string value = TimeToString((datetime)(time_msc / 1000), TIME_DATE | TIME_SECONDS);
   StringReplace(value, ".", "-");
   StringReplace(value, " ", "T");
   return value + "." + StringFormat("%03d", (int)(time_msc % 1000)) + "Z";
  }

void ExportDeals()
  {
   const long login = AccountInfoInteger(ACCOUNT_LOGIN);
   if(login <= 0)
      return;
   if(!HistorySelect(InpHistoryFrom, TimeCurrent() + 60))
     {
      PrintFormat("Trade Journal: HistorySelect failed (%d).", GetLastError());
      return;
     }

   const int total = HistoryDealsTotal();
   if(total == last_deal_count && login == last_account_login)
      return;

   ResetLastError();
   const int file = FileOpen(TEMP_FILE, FILE_WRITE | FILE_CSV | FILE_ANSI, '\t', CP_UTF8);
   if(file == INVALID_HANDLE)
     {
      PrintFormat("Trade Journal: cannot open export file (%d).", GetLastError());
      return;
     }

   FileWrite(file, "login", "server", "currency", "ticket", "position_id", "order",
             "symbol", "side", "quantity", "price", "fee", "executed_at",
             "reported_gross_pnl");
   const string server = AccountInfoString(ACCOUNT_SERVER);
   const string currency = AccountInfoString(ACCOUNT_CURRENCY);
   int exported = 0;

   // shortcut: rewrite the complete deal snapshot, switch to an acknowledged cursor for very large accounts.
   for(int i = 0; i < total; i++)
     {
      const ulong ticket = HistoryDealGetTicket(i);
      if(ticket == 0)
         continue;
      const ENUM_DEAL_TYPE type = (ENUM_DEAL_TYPE)HistoryDealGetInteger(ticket, DEAL_TYPE);
      if(type != DEAL_TYPE_BUY && type != DEAL_TYPE_SELL)
         continue;

      const double quantity = HistoryDealGetDouble(ticket, DEAL_VOLUME);
      const string symbol = HistoryDealGetString(ticket, DEAL_SYMBOL);
      if(quantity <= 0 || symbol == "")
         continue;

      const ENUM_DEAL_ENTRY entry =
         (ENUM_DEAL_ENTRY)HistoryDealGetInteger(ticket, DEAL_ENTRY);
      const double adjustments =
         HistoryDealGetDouble(ticket, DEAL_COMMISSION) +
         HistoryDealGetDouble(ticket, DEAL_FEE) +
         HistoryDealGetDouble(ticket, DEAL_SWAP);
      const string gross_pnl =
         entry == DEAL_ENTRY_IN
         ? ""
         : DoubleToString(HistoryDealGetDouble(ticket, DEAL_PROFIT), 16);

      FileWrite(
         file,
         LongToString(login),
         server,
         currency,
         StringFormat("%I64u", ticket),
         LongToString(HistoryDealGetInteger(ticket, DEAL_POSITION_ID)),
         i,
         symbol,
         type == DEAL_TYPE_BUY ? "buy" : "sell",
         DoubleToString(quantity, 16),
         DoubleToString(HistoryDealGetDouble(ticket, DEAL_PRICE), 16),
         DoubleToString(-adjustments, 16),
         IsoTime(HistoryDealGetInteger(ticket, DEAL_TIME_MSC)),
         gross_pnl
      );
      exported++;
     }

   FileClose(file);
   ResetLastError();
   if(!FileMove(TEMP_FILE, 0, EXPORT_FILE, FILE_REWRITE))
     {
      PrintFormat("Trade Journal: cannot publish export file (%d).", GetLastError());
      return;
     }

   last_deal_count = total;
   last_account_login = login;
   PrintFormat("Trade Journal: exported %d deals.", exported);
  }

int OnInit()
  {
   const int interval = InpExportIntervalSeconds < 10 ? 10 : InpExportIntervalSeconds;
   if(!EventSetTimer(interval))
      return INIT_FAILED;
   ExportDeals();
   return INIT_SUCCEEDED;
  }

void OnTimer()
  {
   ExportDeals();
  }

void OnDeinit(const int reason)
  {
   EventKillTimer();
  }
