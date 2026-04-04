use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Supplier {
    pub name: String,
    pub address: String,
    pub ico: String,
    pub neplavec_dph: bool,
    pub bank_account: String,
    pub iban: String,
    pub swift: String,
    #[serde(default)]
    pub email: String,
    #[serde(default)]
    pub phone: String,
    #[serde(default)]
    pub web: String,
}

impl Default for Supplier {
    fn default() -> Self {
        Self {
            name: "Jiří Kolb".into(),
            address: "Nádražní 124/8\n602 00 Brno\nCzech Republic".into(),
            ico: "12345678".into(),
            neplavec_dph: true,
            bank_account: "1253541002 / 5500".into(),
            iban: "CZ12 5500 0000 0012 5354 1002".into(),
            swift: "RABOCZPP".into(),
            email: String::new(),
            phone: String::new(),
            web: String::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Buyer {
    pub name: String,
    pub address: String,
    pub ico: String,
    #[serde(default)]
    pub dic: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LineItem {
    pub description: String,
    #[serde(default = "one")]
    pub quantity: f64,
    pub unit: String,
    pub unit_price: f64,
    #[serde(default)]
    pub highlighted: bool,
}

fn one() -> f64 {
    1.0
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Invoice {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<i64>,
    pub supplier: Supplier,
    pub buyer: Buyer,
    pub number: String,
    #[serde(default = "constant_symbol_default")]
    pub constant_symbol: String,
    pub issue_date: String,
    pub due_date: String,
    #[serde(default = "payment_default")]
    pub payment_method: String,
    pub line_items: Vec<LineItem>,
    pub status: String,
}

fn constant_symbol_default() -> String {
    "0308".into()
}

fn payment_default() -> String {
    "Převodem".into()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredInvoice {
    pub id: i64,
    #[serde(flatten)]
    pub invoice: Invoice,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AresBuyer {
    pub name: String,
    pub address: String,
    pub ico: String,
    pub dic: String,
}

pub struct DbState(pub Mutex<Connection>);

fn db_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app_data_dir: {e}"))?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("create_dir: {e}"))?;
    Ok(dir.join("faktura.db"))
}

fn migrate(conn: &Connection) -> Result<(), String> {
    conn
        .execute_batch(
            r"
            CREATE TABLE IF NOT EXISTS invoices (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                payload TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS supplier (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                payload TEXT NOT NULL
            );
            ",
        )
        .map_err(|e| e.to_string())?;
    Ok(())
}

fn seed_supplier(conn: &Connection) -> Result<(), String> {
    let n: i64 = conn
        .query_row("SELECT COUNT(*) FROM supplier WHERE id = 1", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    if n > 0 {
        return Ok(());
    }
    let s = Supplier::default();
    let json = serde_json::to_string(&s).map_err(|e| e.to_string())?;
    conn
        .execute(
            "INSERT INTO supplier (id, payload) VALUES (1, ?1)",
            params![json],
        )
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn init_db(app: &AppHandle) -> Result<(), String> {
    let path = db_path(app)?;
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    migrate(&conn)?;
    seed_supplier(&conn)?;
    app.manage(DbState(Mutex::new(conn)));
    Ok(())
}

#[tauri::command]
fn supplier_get(state: State<DbState>) -> Result<Supplier, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let json: String = conn
        .query_row("SELECT payload FROM supplier WHERE id = 1", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    serde_json::from_str(&json).map_err(|e| e.to_string())
}

#[tauri::command]
fn supplier_save(state: State<DbState>, supplier: Supplier) -> Result<(), String> {
    let json = serde_json::to_string(&supplier).map_err(|e| e.to_string())?;
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn
        .execute(
            "INSERT INTO supplier (id, payload) VALUES (1, ?1)
             ON CONFLICT(id) DO UPDATE SET payload = excluded.payload",
            params![json],
        )
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn invoices_list(state: State<DbState>) -> Result<Vec<StoredInvoice>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, payload FROM invoices ORDER BY id DESC")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            let id: i64 = row.get(0)?;
            let payload: String = row.get(1)?;
            Ok((id, payload))
        })
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for r in rows {
        let (id, payload) = r.map_err(|e| e.to_string())?;
        let inv: Invoice = serde_json::from_str(&payload).map_err(|e| e.to_string())?;
        out.push(StoredInvoice { id, invoice: inv });
    }
    Ok(out)
}

#[tauri::command]
fn invoice_save(state: State<DbState>, mut invoice: Invoice) -> Result<i64, String> {
    let id_opt = invoice.id;
    invoice.id = None;
    let payload = serde_json::to_string(&invoice).map_err(|e| e.to_string())?;
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    match id_opt {
        Some(id) => {
            conn
                .execute(
                    "UPDATE invoices SET payload = ?1 WHERE id = ?2",
                    params![payload, id],
                )
                .map_err(|e| e.to_string())?;
            Ok(id)
        }
        None => {
            conn
                .execute("INSERT INTO invoices (payload) VALUES (?1)", params![payload])
                .map_err(|e| e.to_string())?;
            Ok(conn.last_insert_rowid())
        }
    }
}

#[tauri::command]
fn invoice_delete(state: State<DbState>, id: i64) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn
        .execute("DELETE FROM invoices WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn fetch_ares(ico: String) -> Result<AresBuyer, String> {
    let ico = ico.trim().replace(' ', "");
    if ico.len() < 8 {
        return Err("Zadejte platné IČO (8 číslic).".into());
    }
    let url = format!(
        "https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty/{}",
        ico
    );
    let client = reqwest::Client::builder()
        .user_agent("FakturaceApp/0.1 (desktop)")
        .build()
        .map_err(|e| e.to_string())?;
    let resp = client.get(&url).send().await.map_err(|e| e.to_string())?;
    let v: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    if v.get("kod").and_then(|x| x.as_str()) == Some("NENALEZENO") {
        return Err(
            v.get("popis")
                .and_then(|x| x.as_str())
                .unwrap_or("Subjekt nenalezen")
                .to_string(),
        );
    }
    let name = v
        .get("obchodniJmeno")
        .and_then(|x| x.as_str())
        .unwrap_or("")
        .to_string();
    let address = v
        .pointer("/sidlo/textovaAdresa")
        .and_then(|x| x.as_str())
        .unwrap_or("")
        .to_string();
    let ico_out = v
        .get("ico")
        .and_then(|x| x.as_str())
        .unwrap_or(&ico)
        .to_string();
    let dic = v
        .get("dic")
        .and_then(|x| x.as_str())
        .unwrap_or("")
        .to_string();
    if name.is_empty() {
        return Err("ARES nevrátil název subjektu.".into());
    }
    Ok(AresBuyer {
        name,
        address,
        ico: ico_out,
        dic,
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            init_db(app.handle())?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            fetch_ares,
            invoices_list,
            invoice_save,
            invoice_delete,
            supplier_get,
            supplier_save,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
