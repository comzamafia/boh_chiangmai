# คู่มือการเชื่อมต่อ API (สำหรับ Programmer)

> ระบบ **Chiang Mai BOH Public Reporting API** — ดึงข้อมูลรายงานออกไปใช้ในระบบภายนอก
> เอกสารนี้เป็น Step‑by‑Step สำหรับนักพัฒนาที่จะเขียนโปรแกรมมาเรียก API
> เวอร์ชัน: 1.0 · อัปเดต: 2026‑06‑19

---

## 0. ภาพรวม (อ่านก่อนเริ่ม)

- API เป็นแบบ **REST + JSON**, **อ่านอย่างเดียว (read‑only)**, **GET** เท่านั้น
- ยืนยันตัวตนด้วย **API Key** (ไม่มี OAuth / ไม่มี login)
- เปิด **CORS** (`*`) เรียกจาก browser / server / ภาษาอะไรก็ได้
- ทุก response เป็น `Content-Type: application/json` และ **ไม่ถูก cache** (`Cache-Control: no-store`)
- รองรับ **หลายสาขา (multi‑branch)** — ดูข้อ 1

### Endpoint ที่มีให้ใช้
| Endpoint | ใช้ทำอะไร |
|---|---|
| `GET /api/public/server-performance` | ผลงานพนักงานเสิร์ฟ (Leaderboard + คะแนน + KPI ทีม) |
| `GET /api/public/usage-report` | ปริมาณการใช้วัตถุดิบรายสัปดาห์ (Mon–Sun) ต่อเมนู |

---

## 1. แนวคิดเรื่อง “หลายสาขา” (สำคัญมาก)

แต่ละสาขาเป็น **คนละ deployment + คนละฐานข้อมูล + คนละ URL + คนละ API Key**
ดังนั้น **ไม่มี endpoint รวมทุกสาขา** — ฝั่งเราต้องวน “ยิงทีละสาขา” ที่ URL ของสาขานั้นเอง
แล้วเอาผลมารวมเป็นรายงานเดียวในระบบของเราเอง

ทุก response จะมี block `branch` บอกว่า “ข้อมูลก้อนนี้มาจากสาขาไหน” เพื่อให้เรารวมข้อมูลได้ถูก

```jsonc
"branch": { "id": "yorkmills", "name": "Chiang Mai York Mills", "short": "York Mills", "url": "https://yorkmills.sujeevan.ca" }
```

### ตาราง “ทะเบียนสาขา” (Branch Registry) — เก็บไว้ฝั่งเรา
| branchId | Base URL | API Key |
|---|---|---|
| `mississauga` | `https://www.sujeevan.ca` | (ขอจาก admin) |
| `yorkmills` | `https://yorkmills.sujeevan.ca` | (ขอจาก admin) |
| `parklawn` | `https://parklawn.sujeevan.ca` | (ขอจาก admin) |
| _(สาขาใหม่ในอนาคต)_ | `https://<sub>.sujeevan.ca` | (ขอจาก admin) |

> **เพิ่มสาขาใหม่ในอนาคต** ไม่ต้องแก้โค้ดฝั่งเรา — แค่เพิ่ม 1 แถวในตารางนี้ (URL + Key)

---

## 2. การยืนยันตัวตน (Authentication)

ส่ง API Key มาได้ **3 วิธี** (แนะนำใช้ Header — อย่าใส่ใน query เพราะจะติดใน log):

```http
x-api-key: <YOUR_KEY>
```
หรือ
```http
Authorization: Bearer <YOUR_KEY>
```
หรือ (ไม่แนะนำ)
```
?key=<YOUR_KEY>
```

- Key เป็น **คนละตัวต่อสาขา** → ต้องใช้ Key ให้ตรงกับ Base URL ของสาขานั้น
- Key หนึ่งตัวใช้ได้กับทุก endpoint ของสาขานั้น

---

## 3. รหัสสถานะ (HTTP Status Codes)

| Code | ความหมาย | สิ่งที่ต้องทำ |
|---|---|---|
| `200` | สำเร็จ | อ่าน JSON ได้เลย |
| `400` | พารามิเตอร์ผิด (เช่น วันที่ผิดรูปแบบ / ช่วงเกิน 366 วัน) | แก้ค่าที่ส่ง |
| `401` | API Key ผิด/ไม่ได้ส่งมา | ตรวจ Key ให้ตรงสาขา |
| `503` | สาขานี้ยังไม่ได้ตั้งค่า Key | แจ้ง admin ให้ตั้ง env แล้ว redeploy |
| `5xx` | ข้อผิดพลาดฝั่ง server | retry แบบ backoff (ดูข้อ 8) |

โครงสร้าง error เหมือนกันทุกอัน:
```json
{ "error": "Invalid or missing API key." }
```

---

## 4. Endpoint #1 — Server Performance

### 4.1 Request
```
GET /api/public/server-performance?from=YYYY-MM-DD&to=YYYY-MM-DD
```
| Param | รูปแบบ | ค่า default | หมายเหตุ |
|---|---|---|---|
| `from` | `YYYY-MM-DD` | = `to` | วันเริ่ม (รวมวันนั้น), อิง business date แบบ UTC |
| `to` | `YYYY-MM-DD` | วันนี้ | วันสิ้นสุด (รวมวันนั้น) |

ข้อจำกัด: ช่วงสูงสุด **366 วัน**, ต้องมี `from <= to`

### 4.2 ตัวอย่างเรียก
```bash
curl -H "x-api-key: $KEY" \
  "https://yorkmills.sujeevan.ca/api/public/server-performance?from=2026-06-01&to=2026-06-15"
```

### 4.3 ตัวอย่าง Response (ย่อ)
```jsonc
{
  "ok": true,
  "branch": { "id": "yorkmills", "name": "Chiang Mai York Mills", "short": "York Mills", "url": "https://yorkmills.sujeevan.ca" },
  "generatedAt": "2026-06-19T15:00:00.000Z",
  "range": { "from": "2026-06-01", "to": "2026-06-15" },
  "weights": { "salesPerHour": 0.35, "avgPerGuest": 0.25, "drinkPct": 0.20, "dessertPer100": 0.12, "discount": 0.08 },
  "servers": [
    {
      "name": "Jane D.", "isStation": false, "score": 87.4,
      "shifts": 11, "hours": 62.5,
      "netSales": 18450.25, "grossSales": 19100.00, "discount": 649.75, "discountPct": 3.4,
      "tips": 3210.50, "tipPct": 17.4, "guests": 540, "orders": 612,
      "salesPerHour": 295.2, "avgPerGuest": 34.17, "avgPerOrder": 30.15,
      "foodSales": 12010.00, "beverageSales": 2100.25, "alcoholSales": 3890.00, "dessertSales": 450.00,
      "foodCount": 1320, "beverageCount": 410, "alcoholCount": 530, "dessertCount": 90,
      "drinkSales": 5990.25,
      "foodPct": 65.1, "beveragePct": 11.4, "alcoholPct": 21.1, "dessertPct": 2.4, "drinkPct": 32.5,
      "dessertPer100": 16.7, "liquorPerGuest": 7.20
    }
  ],
  "team": {
    "servers": 8, "netSales": 120300.50, "tips": 20800.00, "guests": 3600,
    "avgPerGuest": 33.42, "avgTipPct": 17.3,
    "avgDrinkPct": 31.0, "liquorPct": 20.4, "beveragePct": 10.6, "dessertPct": 2.5
  },
  "coverage": [ { "date": "2026-06-15", "serverCount": 8, "uploadedAt": "2026-06-16T02:11:00.000Z" } ]
}
```

### 4.4 ความหมายของฟิลด์ (`servers[]`)
| Field | ชนิด | ความหมาย |
|---|---|---|
| `name` | string | ชื่อพนักงาน |
| `isStation` | boolean | `true` = ไม่ใช่เสิร์ฟ (เช่น Host) → ไม่ถูกจัดอันดับ, `score=0` |
| `score` | number | คะแนนรวม 0–100 (ถ่วงน้ำหนักด้วย `weights`, normalise เทียบเพื่อนในช่วงนั้น) |
| `shifts` / `hours` | number | จำนวนกะ / ชั่วโมงรวม |
| `netSales` / `grossSales` / `discount` | number | ยอดสุทธิ / ยอดเต็ม / ส่วนลด (สกุลเงินท้องถิ่น) |
| `discountPct` | number | ส่วนลดเป็น % ของ gross |
| `tips` / `tipPct` | number | ทิป / ทิปเป็น % ของ net |
| `guests` / `orders` | number | จำนวนลูกค้า / ออเดอร์ |
| `salesPerHour` | number | ยอดสุทธิต่อชั่วโมง |
| `avgPerGuest` / `avgPerOrder` | number | ยอดเฉลี่ยต่อลูกค้า / ต่อออเดอร์ |
| `foodSales` / `beverageSales` / `alcoholSales` / `dessertSales` | number | ยอดแยกหมวด |
| `*Count` | number | จำนวนชิ้นแยกหมวด |
| `drinkSales` | number | beverage + alcohol |
| `foodPct`/`beveragePct`/`alcoholPct`/`dessertPct`/`drinkPct` | number | % ของ **net** ของคนนั้น (0–100) |
| `dessertPer100` | number | จำนวนของหวานต่อ 100 ลูกค้า |
| `liquorPerGuest` | number | ยอดเหล้าต่อลูกค้า |

> หมายเหตุ: `tips` **ไม่ถูกนำไปคิดคะแนน** (`score`) โดยตั้งใจ
> `coverage` บอกว่าวันไหนมีข้อมูลอัปโหลดแล้วบ้าง → ใช้เช็คว่าช่วงที่ขอมี “วันที่ข้อมูลขาด” หรือไม่

---

## 5. Endpoint #2 — Usage Report (การใช้วัตถุดิบ)

### 5.1 Request
```
GET /api/public/usage-report?days=7
```
| Param | ค่า default | หมายเหตุ |
|---|---|---|
| `days` | `7` | ดึงย้อนหลังกี่วัน (ระบบจำกัด 1–60 วัน) |

### 5.2 ตัวอย่างเรียก
```bash
curl -H "x-api-key: $KEY" "https://www.sujeevan.ca/api/public/usage-report?days=7"
```

### 5.3 โครงสร้าง Response
```jsonc
{
  "ok": true,
  "source": "sujeevan-boh",
  "branch": { "id": "mississauga", "name": "Chiang Mai Mississauga", "short": "Mississauga", "url": "https://www.sujeevan.ca" },
  "generatedAt": "2026-06-19T15:00:00.000Z",
  "days": 7,
  "dowCounts": [1,1,1,1,1,1,1],          // จำนวนวันที่มีข้อมูล แยกตามวัน [จ,อ,พ,พฤ,ศ,ส,อา]
  "protein":   [ /* UsageReportItem */ ],
  "curry":     [ /* UsageReportItem */ ],
  "appetizer": [ /* UsageReportItem */ ],
  "dessert":   [ /* UsageReportItem */ ],
  "beverage":  [ /* UsageReportItem */ ],
  "iceCream":  [ { "flavor": "Mango", "byDow": [2,0,1,0,3,5,4], "total": 15 } ]
}
```

**`UsageReportItem`** (ใช้ใน protein/curry/appetizer/dessert/beverage):
| Field | ความหมาย |
|---|---|
| `label` | ชื่อรายการ (เช่น "Chicken", "Panang Curry") |
| `reportKey` | คีย์เฉพาะรูปแบบ `"<category>::<label>"` (เช่น `"curry::Panang Curry"`) |
| `byDow` | array 7 ช่อง = ปริมาณแยกตามวัน [จ,อ,พ,พฤ,ศ,ส,อา] |
| `total` | ผลรวมทั้งสัปดาห์ |
| `ingredientId` | id วัตถุดิบที่ผูกไว้ (อาจเป็น `null`) |
| `portionSize` / `portionUnit` | ขนาด/หน่วยต่อหนึ่งจาน (อาจเป็น `null`) |
| `chain` | unit conversion chain `{ base, relations:[{from,qty,to}] }` หรือ `null` |

> `byDow` index 0 = **วันจันทร์**, index 6 = **วันอาทิตย์** (เรียงแบบ Mon‑first)

---

## 6. ขั้นตอนการพัฒนา Step‑by‑Step

### Step 1 — ขอ Base URL + API Key ของแต่ละสาขา
ติดต่อ admin เพื่อรับ Key (คนละตัวต่อสาขา) แล้วบันทึกลงตารางทะเบียนสาขา (ข้อ 1)
**อย่า hardcode Key ในโค้ด** — ใช้ env var / secret manager

### Step 2 — ทดสอบด้วย `curl` ก่อนเขียนโปรแกรม
```bash
KEY="<key ของสาขานั้น>"
curl -i -H "x-api-key: $KEY" \
  "https://yorkmills.sujeevan.ca/api/public/server-performance?from=2026-06-01&to=2026-06-07"
```
- เห็น `HTTP/2 200` + JSON = พร้อมใช้
- เห็น `401` = Key ผิด · `503` = สาขายังไม่ตั้ง Key (แจ้ง admin)

### Step 3 — เขียนฟังก์ชัน “ยิงทีละสาขา” แล้ววน registry
ดูตัวอย่างโค้ดข้อ 7

### Step 4 — รวมผลทุกสาขา (ใช้ `branch.id` เป็นคีย์)
แต่ละ response มี `branch.id` → เก็บแยกสาขา หรือ sum รวมตามต้องการ

### Step 5 — จัดการ error + retry
- `4xx` → อย่า retry (เป็นความผิดของ request) ยกเว้นแก้พารามิเตอร์ก่อน
- `5xx` / network error → retry แบบ exponential backoff (ข้อ 8)

### Step 6 — ทำ Caching ฝั่งเรา (แนะนำ)
ข้อมูลอัปเดตวันละครั้ง (หลังร้านอัปโหลดยอดขาย) → ฝั่งเรา cache ผลลัพธ์ ~15–60 นาทีได้สบาย ลดภาระ server

---

## 7. ตัวอย่างโค้ด

### 7.1 Node.js (TypeScript) — วนทุกสาขา + รวมผล
```ts
type Branch = { branchId: string; baseUrl: string; key: string };

const BRANCHES: Branch[] = [
  { branchId: "mississauga", baseUrl: "https://www.sujeevan.ca",       key: process.env.KEY_MISSISSAUGA! },
  { branchId: "yorkmills",   baseUrl: "https://yorkmills.sujeevan.ca", key: process.env.KEY_YORKMILLS! },
  { branchId: "parklawn",    baseUrl: "https://parklawn.sujeevan.ca",  key: process.env.KEY_PARKLAWN! },
];

async function getServerPerf(b: Branch, from: string, to: string) {
  const url = `${b.baseUrl}/api/public/server-performance?from=${from}&to=${to}`;
  const res = await fetch(url, { headers: { "x-api-key": b.key } });
  if (!res.ok) throw new Error(`${b.branchId} ${res.status}: ${await res.text()}`);
  return res.json();
}

async function reportAllBranches(from: string, to: string) {
  const results = await Promise.allSettled(
    BRANCHES.map(b => getServerPerf(b, from, to)),
  );
  return results.map((r, i) =>
    r.status === "fulfilled"
      ? { branchId: BRANCHES[i].branchId, ok: true, data: r.value }
      : { branchId: BRANCHES[i].branchId, ok: false, error: String(r.reason) },
  );
}

// ใช้งาน
reportAllBranches("2026-06-01", "2026-06-15").then(rows => {
  for (const r of rows) {
    if (!r.ok) { console.warn("ข้าม", r.branchId, r.error); continue; }
    console.log(r.branchId, "ยอดทีม net =", r.data.team.netSales);
  }
});
```

### 7.2 Python (requests)
```python
import os, requests

BRANCHES = [
    {"id": "mississauga", "url": "https://www.sujeevan.ca",       "key": os.environ["KEY_MISSISSAUGA"]},
    {"id": "yorkmills",   "url": "https://yorkmills.sujeevan.ca", "key": os.environ["KEY_YORKMILLS"]},
    {"id": "parklawn",    "url": "https://parklawn.sujeevan.ca",  "key": os.environ["KEY_PARKLAWN"]},
]

def get_server_perf(branch, frm, to):
    r = requests.get(
        f"{branch['url']}/api/public/server-performance",
        params={"from": frm, "to": to},
        headers={"x-api-key": branch["key"]},
        timeout=30,
    )
    r.raise_for_status()
    return r.json()

for b in BRANCHES:
    try:
        data = get_server_perf(b, "2026-06-01", "2026-06-15")
        print(b["id"], "team net =", data["team"]["netSales"])
    except requests.HTTPError as e:
        print("ข้าม", b["id"], e.response.status_code, e.response.text)
```

### 7.3 PHP (cURL)
```php
$branches = [
  ["id"=>"mississauga","url"=>"https://www.sujeevan.ca","key"=>getenv("KEY_MISSISSAUGA")],
  ["id"=>"yorkmills","url"=>"https://yorkmills.sujeevan.ca","key"=>getenv("KEY_YORKMILLS")],
];
foreach ($branches as $b) {
  $url = $b["url"] . "/api/public/server-performance?from=2026-06-01&to=2026-06-15";
  $ch = curl_init($url);
  curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER => ["x-api-key: " . $b["key"]],
    CURLOPT_TIMEOUT => 30,
  ]);
  $resp = curl_exec($ch);
  $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
  curl_close($ch);
  if ($code === 200) {
    $data = json_decode($resp, true);
    echo $b["id"] . " team net = " . $data["team"]["netSales"] . "\n";
  } else {
    echo "ข้าม " . $b["id"] . " HTTP $code\n";
  }
}
```

---

## 8. นโยบาย Retry / Timeout (แนะนำ)
- ตั้ง **timeout 30s** ต่อ request
- retry เฉพาะ `5xx` และ network error: หน่วง `1s → 2s → 4s` (สูงสุด 3 ครั้ง)
- ใช้ `Promise.allSettled` / try‑per‑branch — สาขาหนึ่งล่ม **ไม่ทำให้ทั้งรายงานพัง**
- ดู `coverage` (server‑performance) / `dowCounts` (usage‑report) เพื่อรู้ว่าข้อมูลครบหรือไม่

---

## 9. Checklist สำหรับ Programmer
- [ ] เก็บ Key ใน env/secret (ไม่ commit ลง git)
- [ ] ทำ Branch Registry แบบแก้ไขง่าย (เพิ่มสาขาใหม่ = เพิ่ม 1 แถว)
- [ ] ส่ง Key ทาง Header `x-api-key` (ไม่ใส่ใน query)
- [ ] ตรวจ `res.ok` ก่อน parse JSON
- [ ] จัดการ `401/503` แยกจาก `5xx`
- [ ] วน per‑branch ด้วย `allSettled` (กันสาขาเดียวล่มทั้งระบบ)
- [ ] เก็บ `branch.id` ติดไปกับข้อมูลทุกแถวเวลา merge
- [ ] cache ผลฝั่งเรา 15–60 นาที
- [ ] ใช้วันที่รูปแบบ `YYYY-MM-DD` และไม่เกินช่วง 366 วัน (server‑performance)

---

## 10. FAQ
**Q: มี endpoint เดียวที่รวมทุกสาขาไหม?**
A: ไม่มี (แต่ละสาขาแยก DB) — วนยิงทีละสาขาตาม registry แล้วรวมฝั่งเรา

**Q: เพิ่มสาขาใหม่ต้องแก้โค้ดไหม?**
A: ไม่ต้อง — แค่เพิ่ม URL + Key ลง registry

**Q: ข้อมูลอัปเดตบ่อยแค่ไหน?**
A: อัปเดตเมื่อร้านอัปโหลดยอดขายของวัน (ปกติวันละครั้ง) — ฝั่งเรา cache ได้

**Q: เขตเวลา (timezone)?**
A: วันที่อิง business date แบบ UTC; `generatedAt` เป็น ISO‑8601 UTC

**Q: Key รั่ว ทำยังไง?**
A: แจ้ง admin หมุน (rotate) Key ของสาขานั้น — Key เป็นคนละตัวต่อสาขา จึงกระทบแค่สาขาเดียว

---

_เอกสารอ้างอิงทางเทคนิคแบบสั้น: `docs/PUBLIC-API.md`_
