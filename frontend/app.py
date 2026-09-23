import streamlit as st
import requests
import pandas as pd
from datetime import datetime
import io
import json
import os
import tomllib

API_BASE_URL = "http://127.0.0.1:8000"
VERSION_FILE = "version.json"

# Streamlit doesn't expose theme colors as CSS custom properties (var(--...) is not
# available to injected CSS) - it bakes them into CSS-in-JS internally instead. So any
# custom HTML/CSS we inject has to hardcode real color values, read here from the same
# config.toml Streamlit itself uses, to keep everything in sync.
try:
    with open(os.path.join(os.path.dirname(os.path.dirname(__file__)), ".streamlit", "config.toml"), "rb") as f:
        _theme = tomllib.load(f).get("theme", {})
except Exception:
    _theme = {}
PRIMARY_COLOR = _theme.get("primaryColor", "#2E7D32")

st.set_page_config(page_title="Sandveld Vee Dienste", page_icon="🌾", layout="wide")

NAV_ITEMS = [
    ("Analytics & Alerts", "📊"),
    ("Clients", "👥"),
    ("Animals", "🐄"),
    ("Medical Records", "💊"),
    ("Herding Programs", "🚜"),
    ("Products & Import", "📦"),
    ("Invoicing & Reports", "🧾"),
]


# --- CUSTOM STYLING ---
def inject_custom_css():
    css = """
    <style>
        .stApp {
            font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
        }

        /* ---- Sidebar ---- */
        [data-testid="stSidebar"] {
            border-right: 1px solid rgba(127,127,127,0.18);
        }
        .brand-block {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 4px 0 14px 0;
        }
        .brand-logo {
            font-size: 1.7rem;
            line-height: 1;
        }
        .brand-name {
            font-weight: 700;
            font-size: 1.05rem;
            line-height: 1.15;
        }
        .brand-sub {
            font-size: 0.75rem;
            opacity: 0.65;
        }
        [data-testid="stSidebar"] .stButton button {
            justify-content: flex-start !important;
            text-align: left !important;
            border-radius: 8px !important;
            font-weight: 500;
            box-shadow: none !important;
        }
        [data-testid="stSidebar"] .stButton button p {
            text-align: left !important;
        }
        [data-testid="stSidebar"] .stButton button[kind="secondary"] {
            border-color: transparent !important;
            background-color: transparent !important;
        }
        [data-testid="stSidebar"] .stButton button[kind="secondary"]:hover {
            background-color: rgba(127,127,127,0.10) !important;
        }

        /* ---- Page header ---- */
        .page-title {
            font-size: 1.9rem;
            font-weight: 700;
            margin-bottom: 0;
            line-height: 1.2;
        }
        .page-subtitle {
            opacity: 0.65;
            font-size: 0.95rem;
            margin-top: 2px;
        }

        /* ---- Cards / containers ---- */
        [data-testid="stVerticalBlockBorderWrapper"] {
            border-radius: 12px !important;
        }
        .stExpander {
            border: 1px solid rgba(127,127,127,0.18);
            border-radius: 12px !important;
            box-shadow: 0 1px 3px rgba(0,0,0,0.04);
            margin-bottom: 1rem;
        }
        .stExpander:hover {
            border-color: var(--primary-color);
        }
        .stDataFrame, .stTable {
            border-radius: 12px;
            overflow: hidden;
        }

        /* ---- Avatar ---- */
        .avatar-circle {
            width: 42px;
            height: 42px;
            border-radius: 50%;
            background: var(--primary-color);
            color: white;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 700;
            font-size: 1rem;
            flex-shrink: 0;
        }

        /* ---- Quick-connect buttons ---- */
        .comm-button {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            padding: 8px 16px;
            border-radius: 8px;
            text-decoration: none !important;
            font-weight: 600;
            font-size: 0.9rem;
            transition: all 0.15s ease;
            margin-right: 10px;
            border: 1px solid var(--primary-color);
            color: var(--primary-color) !important;
            background-color: transparent;
        }
        .comm-button:hover {
            background-color: var(--primary-color);
            color: white !important;
            transform: translateY(-1px);
        }

        /* ---- Task-style row (overdue list) ---- */
        .task-row {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 4px 0;
        }
        .task-dot {
            width: 9px;
            height: 9px;
            border-radius: 50%;
            background: #DC2626;
            flex-shrink: 0;
        }
    </style>
    """
    st.markdown(css.replace("var(--primary-color)", PRIMARY_COLOR), unsafe_allow_html=True)


inject_custom_css()


# --- LOGIN GATE ---
# The FastAPI backend requires a signed-in user on every business route (see
# app/main.py). This dashboard is a secondary, internal view onto the same
# backend (CLAUDE.md: "kept working but not the shipped app"), so it gets the
# simplest thing that keeps it working - a plain email/password form using
# the same /auth/login endpoint the desktop app uses for its first factor.
# The desktop app's Google sign-in / remembered-device / 5-digit-PIN flow is
# deliberately not replicated here.
def _auth_headers():
    token = st.session_state.get("access_token")
    return {"Authorization": f"Bearer {token}"} if token else {}


def require_login():
    if st.session_state.get("access_token"):
        return

    st.markdown(
        '<div class="brand-block" style="justify-content:center;margin-top:10vh">'
        '<div class="brand-logo">🌾</div>'
        '<div><div class="brand-name">Sandveld Vee Dienste</div>'
        '<div class="brand-sub">Sign in to continue</div></div>'
        "</div>",
        unsafe_allow_html=True,
    )
    _, col, _ = st.columns([1, 1, 1])
    with col:
        with st.form("login_form"):
            email = st.text_input("Email")
            password = st.text_input("Password", type="password")
            submitted = st.form_submit_button("Sign in", use_container_width=True, type="primary")
        if submitted:
            try:
                response = requests.post(
                    f"{API_BASE_URL}/auth/login", json={"email": email, "password": password}, timeout=10
                )
                response.raise_for_status()
                st.session_state.access_token = response.json()["access_token"]
                st.session_state.user_name = response.json()["user"]["name"]
                st.rerun()
            except requests.exceptions.RequestException as e:
                detail = None
                if getattr(e, "response", None) is not None:
                    try:
                        detail = e.response.json().get("detail")
                    except Exception:
                        detail = None
                st.error(detail or "Could not sign in - is the backend running?")
    st.stop()


require_login()


# --- HELPER FUNCTIONS ---
def api_request(method, endpoint, data=None, files=None):
    url = f"{API_BASE_URL}{endpoint}"
    headers = _auth_headers()
    try:
        if method == "GET":
            response = requests.get(url, headers=headers)
        elif method == "POST":
            if files:
                response = requests.post(url, data=data, files=files, headers=headers)
            else:
                response = requests.post(url, json=data, headers=headers)
        elif method == "PUT":
            response = requests.put(url, json=data, headers=headers)
        elif method == "DELETE":
            response = requests.delete(url, headers=headers)
        elif method == "PATCH":
            response = requests.patch(url, headers=headers)
        if response.status_code == 401:
            st.session_state.pop("access_token", None)
            st.rerun()
        response.raise_for_status()
        return response.json()
    except requests.exceptions.RequestException as e:
        st.error(f"API Error: {e}")
        return None


def quiet_get(endpoint):
    """Same as api_request(GET) but silent on failure - used for sidebar badge counts
    so a transient hiccup doesn't spam the sidebar with error boxes."""
    try:
        r = requests.get(f"{API_BASE_URL}{endpoint}", headers=_auth_headers(), timeout=5)
        if r.status_code == 401:
            st.session_state.pop("access_token", None)
            st.rerun()
        r.raise_for_status()
        return r.json()
    except Exception:
        return None


def initials(name: str) -> str:
    parts = [p for p in str(name).strip().split() if p]
    if not parts:
        return "?"
    if len(parts) == 1:
        return parts[0][:2].upper()
    return (parts[0][0] + parts[-1][0]).upper()


def page_header(title: str, subtitle: str = None):
    st.markdown(f'<div class="page-title">{title}</div>', unsafe_allow_html=True)
    if subtitle:
        st.markdown(f'<div class="page-subtitle">{subtitle}</div>', unsafe_allow_html=True)
    st.write("")


# --- SIDEBAR: BRAND + NAV ---
st.sidebar.markdown(
    '<div class="brand-block">'
    '<div class="brand-logo">🌾</div>'
    '<div><div class="brand-name">Sandveld Vee Dienste</div>'
    '<div class="brand-sub">Livestock &amp; Client CRM</div></div>'
    '</div>',
    unsafe_allow_html=True,
)

if "page" not in st.session_state:
    st.session_state.page = NAV_ITEMS[0][0]

_nav_clients = quiet_get("/clients/")
_nav_animals = quiet_get("/animals/")
_nav_overdue = quiet_get("/schedules/overdue")
_nav_counts = {
    "Clients": len(_nav_clients) if _nav_clients else 0,
    "Animals": len(_nav_animals) if _nav_animals else 0,
    "Analytics & Alerts": len(_nav_overdue) if _nav_overdue else 0,
}


def _set_page(name):
    st.session_state.page = name


for name, icon in NAV_ITEMS:
    count = _nav_counts.get(name, 0)
    label = f"{icon}  {name}" + (f"   ·  {count}" if count else "")
    st.sidebar.button(
        label,
        key=f"nav_{name}",
        type="primary" if st.session_state.page == name else "secondary",
        use_container_width=True,
        on_click=_set_page,
        args=(name,),
    )

page = st.session_state.page

st.sidebar.divider()
st.sidebar.caption(f"Signed in as **{st.session_state.get('user_name', '')}**")
if st.sidebar.button("Sign out", use_container_width=True):
    st.session_state.pop("access_token", None)
    st.session_state.pop("user_name", None)
    st.rerun()

st.sidebar.divider()
st.sidebar.caption("🎨 Switch Light/Dark mode via the top-right menu → Settings → Theme.")

# --- VERSION CHECK ---
try:
    with open(VERSION_FILE, "r") as f:
        current_version = json.load(f).get("version", "0.0.0")
    st.sidebar.write(f"Version: `{current_version}`")

    if st.sidebar.button("🔄 Check for Updates"):
        with st.spinner("Checking..."):
            remote_version = "1.0.0"
            if remote_version > current_version:
                st.sidebar.warning(f"Update available! v{remote_version} is now out.")
                st.sidebar.markdown("[Download Latest Version](#)")
            else:
                st.sidebar.success("Your app is up to date!")
except Exception:
    st.sidebar.error("Could not verify version.")


# --- ANALYTICS & ALERTS PAGE ---
if page == "Analytics & Alerts":
    page_header("📊 Analytics & Alerts", "Business intelligence and livestock health alerts at a glance.")

    stats = api_request("GET", "/analytics/revenue")
    if stats:
        c1, c2, c3 = st.columns(3)
        with c1:
            with st.container(border=True):
                st.metric("💰 Total Billed", f"${stats['total_revenue']:.2f}")
        with c2:
            with st.container(border=True):
                st.metric("⏳ Outstanding Balance", f"${stats['outstanding_balance']:.2f}", delta_color="inverse")
        with c3:
            with st.container(border=True):
                st.metric("✅ Collected", f"${stats['collected']:.2f}")
    else:
        st.info("Revenue data unavailable.")

    st.write("")
    st.subheader("🚨 Overdue Treatments")
    overdue = api_request("GET", "/schedules/overdue")
    if overdue:
        animals = api_request("GET", "/animals/") or []
        animal_lookup = {a['id']: a['name'] for a in animals}
        for item in overdue:
            ani_name = animal_lookup.get(item['animal_id'], "Unknown Animal")
            with st.container(border=True):
                cols = st.columns([0.06, 0.7, 0.24])
                cols[0].markdown('<div class="task-dot"></div>', unsafe_allow_html=True)
                cols[1].markdown(f"**{ani_name}** &nbsp;·&nbsp; overdue for **{item['treatment_name']}**", unsafe_allow_html=True)
                cols[2].badge(f"Last: {item['last_date']}", color="red")
    else:
        st.success("No overdue treatments found! All animals are up to date.")

# --- CLIENTS PAGE ---
elif page == "Clients":
    clients = api_request("GET", "/clients/") or []

    header_col, action_col1, action_col2 = st.columns([0.6, 0.2, 0.2])
    with header_col:
        page_header("👥 Clients", f"{len(clients)} client(s) in your network")
    with action_col1:
        st.write("")
        with st.popover("📤 Import", use_container_width=True):
            st.caption("Recognises common header names for Name, Email, Phone, Address and Farm Name in any order.")
            uploaded_client_file = st.file_uploader("Upload Excel (.xlsx/.xls) or CSV", type=["xlsx", "xls", "csv"], key="client_import")
            if uploaded_client_file and st.button("Confirm Import", key="client_import_confirm"):
                mime = "text/csv" if uploaded_client_file.name.endswith(".csv") else "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                files = {"file": (uploaded_client_file.name, uploaded_client_file.getvalue(), mime)}
                result = api_request("POST", "/clients/import", files=files)
                if result:
                    st.success(f"Imported: {result['created']} new, {result['updated']} updated, {result['skipped_blank']} blank rows skipped.")
                    if result["errors"]:
                        st.warning(f"{len(result['errors'])} row(s) had errors:")
                        st.json(result["errors"])
                    st.rerun()
    with action_col2:
        st.write("")
        with st.popover("➕ Add Client", use_container_width=True):
            with st.form("client_form"):
                name = st.text_input("Full Name *")
                email = st.text_input("Email")
                phone = st.text_input("Phone")
                address = st.text_input("Address")
                farm_name = st.text_input("Farm Name")
                submit = st.form_submit_button("Save Client")

                if submit:
                    if not name:
                        st.error("Name is required")
                    else:
                        payload = {"name": name, "email": email, "phone": phone, "address": address, "farm_name": farm_name}
                        if api_request("POST", "/clients/", payload):
                            st.success("Client saved successfully!")
                            st.rerun()

    if not clients:
        st.info("No clients yet. Use **Add Client** or **Import** above to get started.")
    else:
        search = st.text_input("🔍 Search by name or farm", key="client_search", placeholder="Search by name or farm...")
        filtered = clients
        if search:
            s = search.strip().lower()
            filtered = [
                c for c in clients
                if s in (c.get("name") or "").lower() or s in (c.get("farm_name") or "").lower()
            ]

        df = pd.DataFrame(filtered)[["id", "name", "farm_name", "email", "phone", "address"]]
        event = st.dataframe(
            df,
            hide_index=True,
            use_container_width=True,
            column_config={
                "id": None,
                "name": st.column_config.TextColumn("Name"),
                "farm_name": st.column_config.TextColumn("Farm"),
                "email": st.column_config.TextColumn("Email"),
                "phone": st.column_config.TextColumn("Phone"),
                "address": st.column_config.TextColumn("Address"),
            },
            selection_mode="single-row",
            on_select="rerun",
            key="clients_table",
        )

        selected_rows = event.selection.rows if event and event.selection else []
        if not selected_rows:
            st.caption("Select a row above to view a client's details, notes and quick-connect actions.")
        else:
            c = filtered[selected_rows[0]]
            with st.container(border=True):
                head_cols = st.columns([0.06, 0.94])
                head_cols[0].markdown(f'<div class="avatar-circle">{initials(c["name"])}</div>', unsafe_allow_html=True)
                with head_cols[1]:
                    st.markdown(f"### {c['name']}")
                    st.caption(c.get("farm_name") or "No farm name on file")

                tab_info, tab_notes = st.tabs(["ℹ️ Info", "📝 Notes & Reminders"])

                with tab_info:
                    st.write(f"**Email:** {c.get('email') or '—'}")
                    st.write(f"**Phone:** {c.get('phone') or '—'}")
                    st.write(f"**Address:** {c.get('address') or '—'}")

                    st.markdown("---")
                    st.markdown("**⚡ Quick Connect**")
                    comm_cols = st.columns(3)
                    if c.get('email'):
                        comm_cols[0].markdown(f'<a href="mailto:{c["email"]}" class="comm-button">📧 Email</a>', unsafe_allow_html=True)
                    if c.get('phone'):
                        clean_phone = c['phone'].replace(" ", "").replace("-", "").replace("(", "").replace(")", "")
                        comm_cols[1].markdown(f'<a href="tel:{clean_phone}" class="comm-button">📞 Call</a>', unsafe_allow_html=True)
                        wa_phone = clean_phone.lstrip('+')
                        comm_cols[2].markdown(f'<a href="https://wa.me/{wa_phone}" class="comm-button">💬 WhatsApp</a>', unsafe_allow_html=True)

                with tab_notes:
                    notes = api_request("GET", f"/notes/client/{c['id']}")
                    if notes:
                        for n in notes:
                            status = "✅" if n['is_completed'] else "⏳"
                            col_n1, col_n2 = st.columns([0.8, 0.2])
                            col_n1.write(f"{status} {n['content']} (Date: {n['reminder_date']})")
                            if not n['is_completed']:
                                if col_n2.button("Done", key=f"done_{n['id']}"):
                                    api_request("PATCH", f"/notes/{n['id']}/complete")
                                    st.rerun()
                    else:
                        st.info("No notes for this client.")

                    with st.form(f"note_form_{c['id']}", clear_on_submit=True):
                        n_content = st.text_input("Note/Reminder")
                        n_date = st.date_input("Reminder Date", datetime.now())
                        n_submit = st.form_submit_button("Add Note")
                        if n_submit and n_content:
                            payload = {"client_id": c['id'], "content": n_content, "reminder_date": n_date.isoformat()}
                            api_request("POST", "/notes/", payload)
                            st.rerun()

# --- ANIMALS PAGE ---
elif page == "Animals":
    all_animals_count = api_request("GET", "/animals/") or []
    header_col, action_col = st.columns([0.75, 0.25])
    with header_col:
        page_header("🐄 Animals", f"{len(all_animals_count)} animal(s) tracked")
    with action_col:
        st.write("")
        clients = api_request("GET", "/clients/")
        if not clients:
            st.warning("Add clients first.")
        else:
            client_options = {c['name']: c['id'] for c in clients}
            with st.popover("➕ Add Animal", use_container_width=True):
                with st.form("animal_form"):
                    animal_name = st.text_input("Animal Name/ID *")
                    species = st.text_input("Species *")
                    breed = st.text_input("Breed")
                    gender = st.selectbox("Gender", ["Unknown", "Male", "Female"])
                    tag_id = st.text_input("Tag ID")
                    client_for_animal = st.selectbox("Owner (Client)", list(client_options.keys()))
                    submit = st.form_submit_button("Save Animal")
                    if submit:
                        if not animal_name or not species:
                            st.error("Name and Species are required")
                        else:
                            payload = {"client_id": client_options[client_for_animal], "name": animal_name, "species": species, "breed": breed, "gender": gender, "tag_id": tag_id}
                            if api_request("POST", "/animals/", payload):
                                st.success("Animal saved successfully!")
                                st.rerun()

    clients = api_request("GET", "/clients/")
    if not clients:
        st.warning("Please add clients first.")
    else:
        client_options = {c['name']: c['id'] for c in clients}
        selected_client_name = st.selectbox("Filter by Client", ["All"] + list(client_options.keys()))

        if selected_client_name == "All":
            animals = api_request("GET", "/animals/")
        else:
            animals = api_request("GET", f"/animals/client/{client_options[selected_client_name]}")

        if animals:
            for a in animals:
                with st.expander(f"🐾 {a['name']} ({a['species']})"):
                    c1, c2 = st.columns(2)
                    c1.write(f"**Breed:** {a['breed']}")
                    c1.write(f"**Gender:** {a['gender']}")
                    c2.write(f"**Tag ID:** {a['tag_id']}")

                    st.subheader("⚖️ Weight Tracking")
                    weights = api_request("GET", f"/weights/animal/{a['id']}")
                    if weights:
                        df_w = pd.DataFrame(weights)
                        df_w['date'] = pd.to_datetime(df_w['date'])
                        st.line_chart(df_w.set_index('date')['weight'])
                    else:
                        st.info("No weight data available.")

                    with st.form(f"weight_form_{a['id']}", clear_on_submit=True):
                        w_val = st.number_input("Weight", min_value=0.0)
                        w_unit = st.text_input("Unit", value="kg")
                        w_submit = st.form_submit_button("Add Weight Entry")
                        if w_submit:
                            payload = {"animal_id": a['id'], "weight": w_val, "unit": w_unit}
                            api_request("POST", "/weights/", payload)
                            st.rerun()

                    st.subheader("📅 Health Schedule")
                    scheds = api_request("GET", f"/schedules/animal/{a['id']}")
                    if scheds:
                        for s in scheds:
                            st.write(f"**{s['treatment_name']}**: every {s['frequency_days']} days (Last: {s['last_date']})")
                    else:
                        st.info("No scheduled treatments.")

                    with st.form(f"sched_form_{a['id']}", clear_on_submit=True):
                        s_name = st.text_input("Treatment Name")
                        s_last = st.date_input("Last Date", datetime.now())
                        s_freq = st.number_input("Frequency (Days)", min_value=1)
                        s_submit = st.form_submit_button("Add Schedule")
                        if s_submit and s_name:
                            payload = {"animal_id": a['id'], "treatment_name": s_name, "last_date": s_last.isoformat(), "frequency_days": s_freq}
                            api_request("POST", "/schedules/", payload)
                            st.rerun()
        else:
            st.info("No animals found.")

# --- MEDICAL RECORDS PAGE ---
elif page == "Medical Records":
    page_header("💊 Medical Records", "Diagnosis, treatment and medication history per animal.")
    animals = api_request("GET", "/animals/")
    if not animals:
        st.warning("Please add animals first.")
    else:
        animal_options = {a['name']: a['id'] for a in animals}
        top_col1, top_col2 = st.columns([0.7, 0.3])
        selected_animal_name = top_col1.selectbox("Select Animal", list(animal_options.keys()))
        with top_col2:
            st.write("")
            with st.popover("➕ Add Medical Entry", use_container_width=True):
                with st.form("medical_form"):
                    diagnosis = st.text_input("Diagnosis *")
                    treatment = st.text_area("Treatment")
                    medication = st.text_input("Medication")
                    vet_name = st.text_input("Veterinarian")
                    notes = st.text_area("Additional Notes")
                    submit = st.form_submit_button("Save Record")
                    if submit:
                        if not diagnosis:
                            st.error("Diagnosis is required")
                        else:
                            payload = {"animal_id": animal_options[selected_animal_name], "diagnosis": diagnosis, "treatment": treatment, "medication": medication, "vet_name": vet_name, "notes": notes, "date": datetime.now().isoformat()}
                            if api_request("POST", "/medical/", payload):
                                st.success("Medical record added!")
                                st.rerun()

        records = api_request("GET", f"/medical/animal/{animal_options[selected_animal_name]}")
        if records:
            st.dataframe(pd.DataFrame(records), use_container_width=True, hide_index=True)
        else:
            st.info("No records found.")

# --- HERDING PROGRAMS PAGE ---
elif page == "Herding Programs":
    header_col, action_col = st.columns([0.75, 0.25])
    with header_col:
        page_header("🚜 Herding Programs", "Vaccination and management programs assigned across your herd.")
    with action_col:
        st.write("")
        with st.popover("➕ Create Program", use_container_width=True):
            with st.form("program_form"):
                prog_name = st.text_input("Program Name *")
                goal = st.text_input("Goal/Objective")
                desc = st.text_area("Description")
                submit = st.form_submit_button("Create Program")
                if submit:
                    if not prog_name:
                        st.error("Program name is required")
                    else:
                        if api_request("POST", "/programs/", {"name": prog_name, "goal": goal, "description": desc}):
                            st.success("Program created!")
                            st.rerun()

    programs = api_request("GET", "/programs/")
    if programs:
        for p in programs:
            with st.container(border=True):
                st.markdown(f"#### {p['name']}")
                st.write(f"**Goal:** {p['goal']} | **Desc:** {p['description']}")
                animals = api_request("GET", "/animals/")
                if animals:
                    animal_list = [a['name'] for a in animals]
                    sel_ani = st.selectbox(f"Assign animal to {p['name']}", ["Select..."] + animal_list, key=f"prog_{p['id']}")
                    if st.button(f"Assign to {p['name']}", key=f"btn_{p['id']}"):
                        ani_id = next(a['id'] for a in animals if a['name'] == sel_ani)
                        if api_request("POST", "/programs/assign", {"animal_id": ani_id, "program_id": p['id']}):
                            st.success(f"Assigned {sel_ani}!")
                            st.rerun()

                animal_ids = api_request("GET", f"/programs/{p['id']}/animals")
                if animal_ids:
                    all_anis = api_request("GET", "/animals/")
                    names = [a['name'] for a in all_anis if a['id'] in animal_ids]
                    st.write(f"**Current Animals:** {', '.join(names)}")
                else:
                    st.write("**Current Animals:** None")
    else:
        st.info("No herding programs yet. Create one above.")

# --- PRODUCTS & IMPORT PAGE ---
elif page == "Products & Import":
    prods_count = api_request("GET", "/products/") or []
    header_col, action_col1, action_col2 = st.columns([0.6, 0.2, 0.2])
    with header_col:
        page_header("📦 Products & Import", f"{len(prods_count)} product(s) in your price list")
    with action_col1:
        st.write("")
        with st.popover("📤 Import", use_container_width=True):
            uploaded_file = st.file_uploader("Upload Excel (.xlsx)", type=["xlsx"])
            if uploaded_file and st.button("Confirm Import"):
                files = {"file": (uploaded_file.name, uploaded_file.getvalue(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
                if api_request("POST", "/products/import", files=files):
                    st.success("Products imported successfully!")
                    st.rerun()
    with action_col2:
        st.write("")
        with st.popover("➕ Add Product", use_container_width=True):
            with st.form("prod_form"):
                p_name = st.text_input("Product Name *")
                p_price = st.number_input("Price", min_value=0.0, format="%.2f")
                p_unit = st.text_input("Unit (e.g. kg, bottle, service)", value="unit")
                p_desc = st.text_area("Description")
                p_submit = st.form_submit_button("Save Product")
                if p_submit:
                    if not p_name:
                        st.error("Name is required")
                    else:
                        if api_request("POST", "/products/", {"name": p_name, "price": p_price, "unit": p_unit, "description": p_desc}):
                            st.success("Product saved!")
                            st.rerun()

    prods = api_request("GET", "/products/")
    if prods:
        search_p = st.text_input("🔍 Search products", key="product_search", placeholder="Search by name or category...")
        df_p = pd.DataFrame(prods)
        if search_p:
            s = search_p.strip().lower()
            mask = df_p.apply(lambda r: s in str(r.get("name", "")).lower() or s in str(r.get("category", "")).lower(), axis=1)
            df_p = df_p[mask]
        preferred_order = ["name", "category", "code", "packaging", "pack_size", "unit", "cost", "price_excl_vat", "price"]
        column_order = [c for c in preferred_order if c in df_p.columns] + [c for c in df_p.columns if c not in preferred_order and c != "id"]
        st.dataframe(
            df_p,
            use_container_width=True,
            hide_index=True,
            column_order=column_order,
            column_config={
                "id": None,
                "name": st.column_config.TextColumn("Name"),
                "category": st.column_config.TextColumn("Category"),
                "price": st.column_config.NumberColumn("Price (incl. VAT)", format="$%.2f"),
                "price_excl_vat": st.column_config.NumberColumn("Price (excl. VAT)", format="$%.2f"),
                "cost": st.column_config.NumberColumn("Cost", format="$%.2f"),
            },
        )
    else:
        st.info("No products available.")

# --- INVOICING & REPORTS PAGE ---
elif page == "Invoicing & Reports":
    page_header("🧾 Invoicing & Reports", "Generate invoices, add line items and export PDFs or account reports.")

    clients = api_request("GET", "/clients/")
    if not clients:
        st.warning("Please add clients first.")
    else:
        client_options = {c['name']: c['id'] for c in clients}
        top_col1, top_col2 = st.columns([0.7, 0.3])
        selected_client = top_col1.selectbox("Select Client for Invoice", list(client_options.keys()))
        client_id = client_options[selected_client]
        with top_col2:
            st.write("")
            with st.popover("➕ Create Invoice", use_container_width=True):
                with st.form("inv_form"):
                    inv_notes = st.text_area("Invoice Notes")
                    inv_submit = st.form_submit_button("Generate Invoice")
                    if inv_submit:
                        payload = {"client_id": client_id, "notes": inv_notes, "date": datetime.now().isoformat()}
                        if api_request("POST", "/invoices/", payload):
                            st.success("Invoice created!")
                            st.rerun()

        invoices = api_request("GET", f"/invoices/client/{client_id}")
        if invoices:
            for inv in invoices:
                with st.container(border=True):
                    head_cols = st.columns([0.7, 0.3])
                    head_cols[0].markdown(f"#### Invoice #{inv['id']}")
                    status_color = {"paid": "green", "unpaid": "orange", "overdue": "red"}.get(str(inv['status']).lower(), "gray")
                    head_cols[1].badge(inv['status'].upper(), color=status_color)
                    st.write(f"Date: {inv['date']} | Total: ${inv['total_amount']:.2f}")

                    prods = api_request("GET", "/products/")
                    if prods:
                        prod_options = {p['name']: p['id'] for p in prods}
                        col1, col2, col3, col4 = st.columns([0.5, 0.2, 0.3, 0.2])
                        with col1:
                            item_prod = st.selectbox(f"Product for Inv #{inv['id']}", list(prod_options.keys()), key=f"ip_{inv['id']}")
                        with col2:
                            item_qty = st.number_input("Qty", min_value=0.1, step=0.1, key=f"iq_{inv['id']}")
                        with col3:
                            st.write("")
                            if st.button(f"Add Item to #{inv['id']}", key=f"ib_{inv['id']}"):
                                payload = {"invoice_id": inv['id'], "product_id": prod_options[item_prod], "quantity": item_qty}
                                if api_request("POST", "/invoices/items/", payload):
                                    st.success("Item added!")
                                    st.rerun()
                        with col4:
                            st.write("")
                            pdf_resp = requests.get(f"{API_BASE_URL}/invoices/{inv['id']}/pdf")
                            if pdf_resp.status_code == 200:
                                st.download_button("📄 PDF", data=pdf_resp.content, file_name=f"invoice_{inv['id']}.pdf", mime="application/pdf", key=f"pdf_{inv['id']}")

                    items = api_request("GET", f"/invoices/{inv['id']}/items")
                    if items:
                        st.dataframe(pd.DataFrame(items), use_container_width=True, hide_index=True)
        else:
            st.info("No invoices found for this client.")

        st.divider()
        st.subheader("📊 Account Report")
        if st.button(f"Generate Report for {selected_client}"):
            invoices = api_request("GET", f"/invoices/client/{client_id}")
            if invoices:
                total_billed = sum(i['total_amount'] for i in invoices)
                unpaid = sum(i['total_amount'] for i in invoices if i['status'] == 'unpaid')
                m1, m2 = st.columns(2)
                m1.metric("Total Billed", f"${total_billed:.2f}")
                m2.metric("Outstanding Balance", f"${unpaid:.2f}")
                df_report = pd.DataFrame(invoices)
                csv = df_report.to_csv(index=False).encode('utf-8')
                st.download_button("Download Report (CSV)", csv, f"report_{selected_client}.csv", "text/csv")
            else:
                st.info("No data available for report.")
