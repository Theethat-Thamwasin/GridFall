# GRIDFALL

เกมต้นแบบ Tactical Battle Royale แบบวางแผนพร้อมกัน เล่น Solo กับบอต หรือ Multiplayer ผ่านลิงก์ห้องออนไลน์ด้วย tunnel หรือใน LAN สูงสุด 8 คน ช่องว่างเติมด้วยบอต มีเสียงสังเคราะห์จาก Web Audio และภาพสนามที่วาดด้วย Canvas ทั้งหมด ใช้แพ็กเกจ ws สำหรับ WebSocket และไม่โหลดไฟล์เกมจาก CDN

## เปิดเล่น

รันจากโฟลเดอร์นี้ด้วย Node.js แล้วเปิดด้วย Edge หรือ Chrome:

```powershell
npm install
npm start
```

จากนั้นเปิด <http://localhost:4173> และกด **PLAY SOLO** เสียงเริ่มหลังคลิก เลือกเวลา Planning ได้ 15 วินาที, 25 วินาที หรือไม่จำกัดสำหรับฝึก

## เล่นออนไลน์ผ่าน Tunnel

เปิดด้วยคำสั่งเดียว:

```powershell
npm run online
```

คำสั่งนี้เปิดเซิร์ฟเวอร์เกมหากยังไม่ได้เปิด ดาวน์โหลด cloudflared เวอร์ชันที่กำหนดจาก Cloudflare พร้อมตรวจ SHA-256 แล้วเปิด Cloudflare Quick Tunnel แสดงลิงก์ `https://….trycloudflare.com` โดยไม่ต้องมีบัญชีหรือโดเมน เปิดลิงก์นั้น กด **CREATE ROOM → COPY LINK** แล้วส่งให้เพื่อนจากคนละเครือข่ายได้ เมื่อเปิดห้องจาก localhost ปุ่ม COPY LINK ก็ใช้ URL สาธารณะนี้ด้วย

ต้องเปิดเครื่อง เซิร์ฟเวอร์ และ tunnel ค้างไว้ กด Ctrl+C ที่ process online เพื่อปิด tunnel; เซิร์ฟเวอร์ที่เปิดไว้ก่อนจะยังทำงาน ลิงก์ชั่วคราวเปลี่ยนเมื่อเปิด tunnel ใหม่ ไฟล์ `tools/online-session.json` เก็บเฉพาะ URL/port/PID ไม่เก็บ token ห้อง และเซิร์ฟเวอร์ไม่เปิดให้ดาวน์โหลดไฟล์นี้

ถ้าต้องการ **โค้ดล่าสุด + เซิร์ฟเวอร์ใหม่ + ลิงก์ใหม่** ใช้คำสั่งเดียว:

```powershell
npm run online:fresh
```

คำสั่งนี้โหลดโค้ดจากไฟล์ปัจจุบัน เปิดเซิร์ฟเวอร์ใหม่บนพอร์ตว่างอัตโนมัติ แล้วเปิด Cloudflare Tunnel ใหม่ แสดงทั้งลิงก์ localhost และลิงก์ออนไลน์ ใช้ลิงก์ใหม่สร้างห้องและส่งให้เพื่อน เปิดหน้าต่างคำสั่งนี้ค้างไว้ระหว่างเล่น Ctrl+C จะปิดเซิร์ฟเวอร์และ tunnel ของรอบนี้ ใช้ `npm run online:fresh -- --ngrok` ได้หากตั้งค่า ngrok ไว้แล้ว

ถ้าต้องการ URL ใหม่ ให้ใช้:

```powershell
npm run online:new
```

คำสั่งปกติจะตรวจทั้งเซิร์ฟเวอร์ในเครื่องและลิงก์สาธารณะก่อนแจ้งว่ายังออนไลน์ หากข้อมูลเก่าค้างจะเปิดใหม่เอง ไม่ปิดโปรเซสอื่นจากเลข PID ที่บันทึกไว้ คำสั่ง `online:new` ใช้เซิร์ฟเวอร์ที่เปิดอยู่และขอลิงก์ใหม่ หากเซิร์ฟเวอร์นั้นเปิดจากหน้าต่าง `online` เก่า ต้องเปิดหน้าต่างนั้นค้างไว้ด้วย

Quick Tunnel ไม่รองรับ SSE เกมจึงใช้ WebSocket/WSS ส่งสถานะ ส่งแผนที่เฉพาะช่องที่เปลี่ยน ใช้การบีบอัดเมื่อ tunnel รองรับ และ reconnect อัตโนมัติ โดยคำนวณผล/กรอง Fog ที่เซิร์ฟเวอร์เหมือน LAN ([Cloudflare Quick Tunnels](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/))

ใช้ ngrok ได้เช่นกัน หลังติดตั้งและตั้งค่า authtoken **ในเครื่องของคุณ** ตาม [ngrok สำหรับ Windows](https://ngrok.com/download/windows):

```powershell
npm run online:ngrok
```

หรือเปิด `ngrok http 4173` เอง แล้วเปิด URL HTTPS ที่ ngrok ให้เพื่อสร้างห้อง หากใช้ ngrok แบบฟรี เพื่อนอาจต้องกด **Visit Site** ครั้งแรก ([ngrok free plan](https://ngrok.com/docs/pricing-limits/free-plan-limits/))

ตั้ง `PORT` เพื่อเปลี่ยนพอร์ต, `NGROK_PATH` / `CLOUDFLARED_PATH` เพื่อใช้ executable ที่ติดตั้งไว้ หรือ `PUBLIC_URL` เป็น URL HTTPS ของ tunnel ที่เปิดเองก่อนรัน `npm start` เพื่อให้ COPY LINK จาก localhost ใช้ URL นั้น

## เล่น Multiplayer ในเครื่องและ LAN

หน้า Lobby ใช้พรีวิวตัวละครเคลื่อนไหวและการ์ดทั้ง 7 ตัวเหมือน Solo เลือกการ์ดเพื่ออ่านสกิลและระยะเดิน แล้วกด **ยืนยันตัวละคร** เพื่อบันทึกชื่อและตัวละครลงห้อง การเปลี่ยนด่านหรือรายชื่อจากผู้เล่นอื่นจะไม่ทับข้อมูลที่กำลังเลือก ปุ่มเริ่มแมตช์ คัดลอกลิงก์ และออกจากห้องอยู่ด้านล่างตลอด รองรับภาษาไทย / English และจอมือถือ


1. เจ้าของห้องเลือก Multiplayer ใส่ชื่อและเลือกตัวละคร แล้วกด **CREATE ROOM** เลือกขนาดด่านและปรับจำนวนบอทใน Lobby ได้เฉพาะเจ้าของห้อง
2. กด **COPY LINK** ส่งให้เพื่อนบน Wi-Fi / LAN เดียวกัน ลิงก์ใช้ IP ของเครื่องเจ้าของห้อง เช่น `http://192.168.1.20:4173/?room=ABC123` เพื่อนเลือกตัวละคร ใส่ชื่อ แล้วกด **JOIN**
3. เจ้าของห้องกด **START MATCH** ทุกคนวางแผนพร้อมกัน เมื่อคนที่ยังมีชีวิตล็อกครบ หรือหมดเวลา เซิร์ฟเวอร์เริ่มการปะทะ ช่องผู้เล่นว่างเป็นบอต

ทดสอบในเครื่องเดียวได้โดยเปิดอีกแท็บที่ `http://localhost:4173/?room=รหัสห้อง` หรือพิมพ์รหัสห้องในหน้าแรก ตัวละครแต่ละคนควบคุมแยกกัน เปิดวิธีเล่น สลับแท็บ หรือดู replay จะไม่หยุดเวลาของห้อง

เซิร์ฟเวอร์ฟังที่ `0.0.0.0:4173` โดยปริยาย เปลี่ยนพอร์ตด้วย `$env:PORT=4180` ได้ ถ้าเพื่อนเข้าจาก LAN ไม่ได้ ตรวจว่าเชื่อมเครือข่ายเดียวกัน และ Windows Firewall อนุญาต Node.js บนเครือข่ายส่วนตัว หากมีหลาย network adapter ให้ใช้ IP ของ LAN ที่เพื่อนเข้าถึงได้ในลิงก์แทน IP ที่เลือกให้อัตโนมัติ

เมื่อสายหลุด เบราว์เซอร์พยายามเชื่อมต่อใหม่ หากรีเฟรช ให้ JOIN ห้องเดิมในแท็บเดิมเพื่อกลับไปควบคุมตัวละครเดิม (token เก็บใน sessionStorage) แผนที่ไม่ล็อกก่อนหมดเวลาถูกแทนด้วย WAIT ห้องและ replay เก็บใน RAM ของเซิร์ฟเวอร์ รีสตาร์ทเซิร์ฟเวอร์จะล้างทั้งหมด

เซิร์ฟเวอร์ตรวจระยะ เส้นทาง กระสุน ของ ปืน Skill และเทิร์นก่อนรับแผน คำนวณ combat เอง และส่งข้อมูลแยกตามสายตาของแต่ละคน: ศัตรูนอกสายตาไม่มีตำแหน่งจริง ไม่มีของที่ซ่อน ไม่มีแผนศัตรู และไม่มี seed จำลองเกม การเปลี่ยนแปลง Terrain ที่ยังไม่เห็นใช้ข้อมูลเดิม เสียงไกลบอกบริเวณโดยประมาณ การยิงโดนเป้าหมายที่มองไม่เห็นให้เฉพาะ feedback ไม่มีพิกัดเป้าหมาย

## Resolution และ Replay

ล็อกแผนแล้วเข้าสู่ Resolution โดยตรง 80 ticks × 45ms = **3.6 วินาที** Multiplayer รอผู้เล่นที่ยังไม่ล็อกแผนก่อนเริ่มพร้อมกัน ไม่มีช่วงแนะนำคำสั่งหรือกล้อง Cinematic และค่าจาก Client เก่าจะถูก Ignore

ปุ่ม **▷** ริมซ้ายย้อนดูเทิร์นล่าสุดจากภาพรวม โดยยังเห็นตามสายตาของคุณ ณ เวลานั้น เลือกกล้องตามตัวคุณได้ ใช้แถบเวลา เล่น/หยุด และความเร็ว **0.5× / 0.75× / 1× / 2× / 4×** ค่าเริ่มต้น **0.75×** อ่านเหตุการณ์ได้นานขึ้น กด **Space** เล่น/หยุด ลูกศรซ้ายขวาย้อน/ข้ามหนึ่งวินาที และ **Escape / EXIT** กลับสู่เกม Solo หยุดเวลา Planning ระหว่าง replay; Multiplayer เวลาเซิร์ฟเวอร์เดินต่อ และกลับเข้าการต่อสู้อัตโนมัติเมื่อเทิร์นใหม่เริ่ม
หลังแมตช์จบ หน้าผลการแข่งขันระบุชื่อผู้ชนะและมีปุ่ม **FULL MATCH REPLAY** ย้อนดูการปะทะทุกเทิร์นตั้งแต่เริ่มจนถึงผู้ชนะ ใช้ปุ่ม `|◁` / `▷|` ย้ายระหว่างเทิร์นได้ ถ้าคุณตายก่อน กด **SPECTATE** ให้บอตสู้จนจบก่อนดู Replay ทั้งเกม
Replay เก็บสถานะจริง กระสุน เสียง การเก็บของ และสิ่งกีดขวางที่ถูกทำลาย โดยไม่จำลองผลใหม่ ระหว่างเกมมีเฉพาะมุมมองของคุณ หลังเซิร์ฟเวอร์ยืนยันผู้ชนะจึงเปิด Replay ทั้งสนามและกล้องตามทุกตัวละครได้ ประวัติ Solo อยู่ในแมตช์ปัจจุบัน ส่วน Multiplayer ดาวน์โหลด replay ทั้งแมตช์จากเซิร์ฟเวอร์หลังจบได้ แม้เคยรีเฟรชระหว่างเกม

## วิธีเล่น

แต่ละเทิร์นมี 2 AP การเดินลากเส้น 4 ทิศจากตัวละคร ส่วนยิงและฟันเล็งตามเมาส์ได้อิสระโดยไม่ Snap ช่อง คลิกเพื่อยืนยันมุม เมื่อพร้อมกด **SPACE / LOCK & RESOLVE** ผู้เล่นและบอตทำคำสั่งบน Timeline เดียวกันเป็นเวลา 3.6 วินาที คำสั่งแรกเริ่มที่ 0 วินาที คำสั่งสองเริ่มที่ 1.8 วินาที ตัวละครเดินต่อเนื่องระหว่างช่อง กล้องค่อย ๆ ตามตัว และไม่มีการสั่นหรือแสงวาบเต็มจอ

มุมยิงถูกเก็บตอนวางแผน กระสุนออกจากตำแหน่งจริงตอนลั่นไกและวิ่งเต็มระยะคงที่ของปืน คลิกใกล้ตัวหรือไกลตัวไม่เปลี่ยนระยะ กระสุนหยุดเมื่อชนกำแพง Barricade หรือตัวละคร ใช้ hitbox วงกลมรัศมี 0.32 ช่อง การผ่านช่องที่มีคนอยู่แต่เฉียดตัวจึงพลาดได้

| ปุ่ม | Action |
|---|---|
| 1 | Move คลิกซ้ายค้างจากตัวละครแล้วลาก 4 ทิศ |
| 2 | Shoot เล็งมุมอิสระแล้วคลิก |
| 3 | Slash เล็งทิศ กวาด 120° ระยะ 1.5 ช่อง ทำ 45 damage |
| 4 | Smoke เพื่อบังสายตา |
| Q | Undo คำสั่งล่าสุด |
| R | Reload |
| G | Guard ในช่วงคำสั่งนั้น |
| H | Medkit +35 HP |
| E | Signature Skill |
| B | Grenade แล้วคลิกจุดระเบิด |
| WASD / ลูกศร / ลากเมาส์ขวา | เลื่อนกล้อง |
| C | กล้องกลับมาตามตัวละคร |
| ล้อเมาส์ / ปุ่ม + − | ซูมเข้าออก |
| Escape | ล้างแผน / ปิดวิธีเล่น / ออกจาก Replay |
| Space | Lock |
| Tab | เปิด / ปิด Field Log |
| I | เปิด / ปิดกระเป๋าเพื่อเปลี่ยนปืน |
| M | เปิด / ปิดแผนที่ย่อ |

เลือก STRIDER, WRAITH, ORACLE, CINDER หรือ AEGIS ก่อนเริ่มแมตช์ กด **E** ใช้สกิลหนึ่ง AP คูลดาวน์ STRIDER/WRAITH 2 เทิร์น, ORACLE/CINDER 3 เทิร์น และ AEGIS 4 เทิร์น STRIDER เดินปกติ 4 ช่อง ตัวละครอื่น 3 ช่อง ปืนและไอเทมที่เก็บใหม่ใช้ได้เทิร์นถัดไป

**CINDER:** โยนไฟได้ระยะตรง 5 ช่อง ข้ามกำแพงได้ ไฟติดช่องที่เดินได้และไม่มีน้ำในพื้นที่ 3×3 นาน 2 เทิร์น เผาครั้งละ 12 ที่ tick 20 และ 60 ไม่ซ้อน damage จากไฟหลายกอง Guard และ Cover ไม่ลดไฟ แต่ Shield รับ damage ได้ เดินออกเพื่อหลบและระวังไฟของตัวเอง สกิลไม่ใช้ระเบิดในกระเป๋า

**AEGIS:** เติม Shield 12 สูงสุด 40 และสะท้อนกระสุน 2 นัดที่ชนตัวกลับตามแนวเดิมด้วยดาเมจ 80% ใช้ได้ถึงจบเทิร์น ไม่ใช้กระสุนของเรา ไม่สะท้อนระเบิด ฟัน หรือไฟ หลังสะท้อนครบสองนัด กระสุนนัดถัดไปทำดาเมจตามปกติ บอตใช้สกิลใหม่ได้เหมือนผู้เล่น และ LAN ตรวจคำสั่งที่เซิร์ฟเวอร์

ช่องลายเหลืองดำจะหล่นภายในสองเทิร์น สีดำคือ Void ที่เดินไม่ได้ คนที่อยู่บนแพลตฟอร์มตอนหล่นจะถูกกำจัดทันที สัญลักษณ์ Supply ในสนามเป็น Beacon ที่สุ่มเกิดบนพื้นที่ที่ยังไม่ร่วง ผู้ที่รอดคนสุดท้ายชนะ ถ้าคนสุดท้ายตายพร้อมกันจะไม่มีผู้รอดชีวิต

## ไฮไลต์คำสั่งและข้อจำกัด

เลือกคำสั่งแล้วเห็นขอบเขตทันที: **เขียวอ่อน** ใช้ได้, **แดงอ่อน** บล็อก, **เหลืองอ่อน** เสี่ยง และ **เทาอ่อน** ยังไม่ทราบใน Fog ไม่มีเลขค่าเดิน เลขคำสั่ง หรือข้อความ debug บนช่อง ไม่มีแผงอธิบายข้อผิดพลาดหรือ popup เมื่อคลิกจุดที่ใช้ไม่ได้ สถานะใช้สีและเคอร์เซอร์แทน

- **Move / Kinetic Dash:** ไฮไลต์ช่องที่เดินถึงด้วยสีเขียว น้ำยังใช้ 2 ต่อช่อง กำแพง รั้ว เส้นทางที่เกินงบ และการตัดมุมเป็นสีแดงอ่อน ช่องที่มีคนขวางหรืออยู่ใน Zone เป็นสีเหลืองอ่อน
- **Grenade / Smoke:** วงระยะโยนจริง 6 / 5 ช่อง พื้นที่ผลกระทบ 3×3 และเตือนระเบิดโดนตัวเอง โยนข้ามกำแพงและลงบนกำแพงได้ตามกติกา จุดเกินระยะหรืออยู่นอกสนามใช้ไม่ได้
- **Shoot / Slash:** ยิงยังเล็งมุมอิสระและมีระยะคงที่ แสดงจุดชนกำแพง/รั้วกับแนวที่ถูกบัง แต่ยิงเพื่อทำลายได้ เป้าหมายในแนวเล็งเป็นการคาดการณ์ตามตำแหน่งปัจจุบัน ฟันแสดงกรวย 120° ระยะ 1.5 ช่อง มุมที่กำแพงบัง และรั้วที่ฟันทำลายได้
- **Blink / Scan:** Blink ต้องอยู่ระยะ 3 และเห็นจากจุดเริ่ม ไม่ผ่านกำแพงหรือควัน Scan แสดงขอบเขตระยะ 12 และส่วนที่ถูกบัง โดยไม่เปิดเผยศัตรูก่อนใช้
- **ปุ่มใช้ของและสกิล:** กระสุนไม่พอ แม็กเต็ม ไม่มีกระสุนสำรอง HP เต็ม ของไม่พอ สกิลที่ใช้ไปแล้ว/ติดคูลดาวน์ และ Sniper หลังเดิน แสดงปุ่มสีจาง กดไม่ได้โดยไม่เสีย AP ตัวเลขกระสุน ของ และคูลดาวน์อยู่ใต้ไอคอน

คำสั่งที่สองใช้จุดเริ่มตามปลายทางที่วางไว้ ไฮไลต์อัปเดตทันทีเมื่อเดินครั้งแรกหรือกด Undo ตัวเลขกระสุนและของบนปุ่มหักส่วนที่จองในแผนแล้ว ของใหม่ที่กำลังรอเทิร์นถัดไปไม่ถูกนับเป็นของพร้อมใช้ เมื่อแผนเต็มให้กด **Q** แก้ หรือ **Space** ล็อก

Fog และพื้นสนามสว่างขึ้นเพื่ออ่าน Terrain ได้ง่าย แต่ศัตรู ของ ไฟ และข้อมูลนอกสายตายังถูกซ่อนตามกติกา Multiplayer

ในล็อบบี้ **HOST** เลือกด่านและเริ่มแมตช์ได้ ทุกคนเปลี่ยนชื่อกับตัวละครของตัวเองแล้วกดบันทึกได้ คนจอยเห็นด่านที่หัวห้องเลือก แต่แก้ด่านหรือเริ่มเกมเองไม่ได้ เซิร์ฟเวอร์ตรวจสิทธิ์ด้วย

เมื่อตาย เลือก **SPECTATE** เพื่อติดตามผู้ที่ยังรอด สลับคนด้วย **‹ / ›** กล้องตามอย่างต่อเนื่องและเห็นเฉพาะพื้นที่ตามสายตาของคนนั้น หากคนนั้นตายจะเปลี่ยนไปดูคนที่ยังรอดอัตโนมัติ หรือเลือก **EXIT TO MENU** เพื่อออกจากแมตช์ ล้างรหัสห้องและลิงก์เก่า ไม่มีปุ่ม Respawn เกมใหม่ให้ **CREATE ROOM → COPY LINK** เพื่อรับรหัสห้องและลิงก์ใหม่ ลิงก์แมตช์เดิมใช้เข้าตัวละครใหม่ระหว่างเกมไม่ได้ การเชื่อมต่อหลุดหรือรีเฟรชยังกลับมาตัวละครเดิมได้จนกว่าจะกด Exit

## Loot แยกประเภท

เดินทับช่องที่มีของเพื่อเก็บอัตโนมัติ รวมถึงช่องระหว่างทาง ไม่เสีย AP เพิ่ม ไม่มีปุ่ม Loot / F แล้ว ของหนึ่งชิ้นให้เฉพาะทรัพยากรที่ระบุ และใช้ได้ตั้งแต่เทิร์นถัดไปเท่านั้น แม้เก็บในคำสั่งแรกก็ยังใช้ในคำสั่งที่สองไม่ได้ เกราะใหม่ก็ยังไม่ลดความเสียหายในเทิร์นที่เก็บ แผง **AUTO PICKUP** แสดงของที่รอและเทิร์นที่พร้อมใช้

| สี / ไอคอน | ประเภท | ได้รับ |
|---|---|---|
| ม่วง / รหัสปืน | Weapon | ปืนที่ระบุ พร้อมแม็กเต็ม ปืนซ้ำเปลี่ยนเป็นกระสุนสำรองขนาดหนึ่งแม็ก |
| เหลือง ▥ | Ammo | กระสุนสำรอง +24 |
| เขียว + | Medkit | ยา +1 พกสูงสุด 3 |
| ฟ้า ◇ | Armor | Shield +20 สูงสุด 40 |
| ส้ม ◉ | Grenade | ระเบิด +1 พกสูงสุด 3 |
| เทา ≋ | Smoke | ควัน +1 พกสูงสุด 3 |

ถ้ากระเป๋าเต็ม ของยังอยู่บนพื้น เดินทับ Beacon ณ จุดสุ่มบนพื้นที่ปลอดภัยเพื่อรับ Supply อัตโนมัติ ใช้ได้เทิร์นถัดไปเช่นกัน บอตกับผู้เล่นเริ่มด้วย HP เกราะ ปืน กระสุน และของเท่ากัน ใช้ระบบเก็บของ กระเป๋า เปลี่ยนปืน Reload Heal Smoke Grenade Guard และ Skill เดียวกัน บอตวางแผนจากสิ่งที่มองเห็น ไม่อ่านแผนที่เราล็อกไว้

## ปืนในสนามและ Barricade

ทุกด่านเริ่มด้วยของ 22 ชิ้น รวมปืนครบ 8 แบบอย่างละหนึ่งกระบอก เมื่อเข้าเทิร์น **5, 10, 15…** มีของใหม่ 10 ชิ้นลงบนช่องว่างใน Safe Area ไม่ทับของที่ยังไม่ได้เก็บหรือผู้เล่น แจ้งเตือนการ Drop แต่ตำแหน่งของยังต้องค้นหาตามสายตา เลือกปืนในกระเป๋า **I** ก่อนวางคำสั่ง แต่ละกระบอกเก็บกระสุนในแม็กแยกกัน

| ปืน | Damage / นัด | นัด / คำสั่งยิง | ระยะคงที่ | แม็ก |
|---|---:|---:|---:|---:|
| AR / VANDAL | 12 | 3 | 9 | 15 |
| P9 / SIDEARM | 28 | 1 | 7 | 8 |
| SG / BREACHER | สูงสุด 48 ใกล้ตัว | 1 | 4 | 4 |
| SR / DEADLOCK | 62 | 1 | 12 | 3 |
| SMG / STINGER | 9 | 5 | 6 | 25 |
| LMG / TITAN | 11 | 4 | 10 | 32 |
| DMR / SENTINEL | 34 | 1 | 11 | 10 |
| RV / OUTLAW | 40 | 1 | 6 | 6 |

Sniper ยิงหลังเคลื่อนที่ในเทิร์นเดียวกันไม่ได้ Shotgun กระจายและความเสียหายลดตามระยะ เสียงปืนแต่ละชนิดมีโทนต่างกัน

Barricade เป็นรั้วไม้มี 45 HP ขวางการเดิน สายตาและกระสุน ยิง ฟัน หรือระเบิดเพื่อทำลายแล้วเดินผ่านซากได้

## เลือกด่านและกล้อง

เลือกใน **BATTLEFIELD** ก่อนกด Deploy:

- **SMALL / SHATTER:** สุ่ม 28–36 ช่องต่อแกน กระชับและปะทะเร็ว
- **MEDIUM / FRACTURE:** สุ่ม 36–44 ช่องต่อแกน สมดุลระหว่างทางยิงและทางอ้อม
- **LARGE / ABYSS:** สุ่ม 44–56 ช่องต่อแกน พื้นที่กว้างและมีเส้นทางหลายจุด

ทุกขนาดสุ่มรูปร่าง ellipse / diamond / cross / offset พร้อมห้อง สะพาน ที่กำบัง รั้ว และของใหม่ตาม seed

ทุกด่านใช้แพลตฟอร์มที่เชื่อมถึงกันและวงบีบตามเส้นทางจริง ใช้ปุ่ม **⛶** ริมซ้ายดูทั้งสนาม กด **M** เปิดแผนที่ย่อ คลิกเพื่อย้ายกล้อง และ **C** กลับมาตามตัวเรา แผนที่ย่อยังรักษาหมอก สนามใช้พื้นที่หน้าต่างทั้งหมด ปุ่มคำสั่งเป็นไอคอนริมขวา ดูรายละเอียดด้วย tooltip สถานะสุขภาพริมล่างซ้าย แผนสองช่องริมล่าง และ **Tab** เปิด log ลอย

## สิ่งที่มีในเวอร์ชันนี้

- สนามสุ่มทั้งหมดใน 3 ขนาด: เล็ก กลาง ใหญ่ พร้อมกล้อง ซูม และแผนที่ย่อ
- บอตหลายบุคลิก วางแผนจากสิ่งที่มองเห็นและความจำ ไม่อ่านคำสั่งผู้เล่น
- ปืน 8 แบบ กระจายให้เก็บในทุกด่าน กระเป๋าและแม็กแยกแต่ละกระบอก
- Free Aim, Slash, Guard, Medkit, Smoke, Grenade และตัวละครพร้อม Signature Skill 5 แบบ
- Fog, ตำแหน่งที่เห็นล่าสุด และเสียงปืนที่แสดงเป็นพื้นที่โดยประมาณ
- Loot 6 ประเภท เก็บอัตโนมัติและใช้ได้เทิร์นถัดไป, Barricade ทำลายได้, Supply Beacon, Grid Collapse, ผลแมตช์ และ Spectator หลังตาย
- ล็อกแผนแล้วเข้าสู่ Resolution 3.6 วินาทีโดยตรง Multiplayer รอผู้เล่นล็อกแผนพร้อมกัน พร้อมสถานะผู้เล่นที่ยังรอ
- Multiplayer ผ่านรหัสและลิงก์ห้องออนไลน์ / LAN สูงสุด 8 คน เซิร์ฟเวอร์คำนวณผลและกรองข้อมูลตามสายตา
- Replay ภาพรวมของเทิร์นล่าสุดและทั้งแมตช์ พร้อมแถบเวลา ความเร็ว กล้องตามตัวละคร วิถีกระสุนและเอฟเฟกต์
- เสียงปืนแยกชนิด ระเบิด hit/shield reload heal blink scan เตือน Zone และเสียงชนะ/แพ้
- ปุ่มทดสอบเสียง ปิดเสียงและปรับระดับเสียง
- หน้าจอรองรับมือถือ; แนะนำเดสก์ท็อปเพื่อเล็งและอ่านสนามได้ชัด

`sound-preview.wav` เป็นตัวอย่างเสียงที่สร้างจากโค้ดเสียงชุดเดียวกับเกม สามารถเปิดฟังแยกได้

## ขอบเขต Prototype

Multiplayer ใช้ WebSocket ส่งสถานะ realtime และ POST ส่งคำสั่ง รองรับ tunnel ออนไลน์ผ่าน HTTPS/WSS และการเชื่อมต่อใหม่ด้วยตัวละครเดิม ยังไม่มีโฮสต์ถาวร บัญชีผู้ใช้ การบันทึกห้องถาวร หรือ reconnect ข้ามอุปกรณ์ และยังไม่มี Ultimate, Ranked, ระบบปลดล็อก, ทีม, Conditional Actions หรือแคมเปญ

โครงสร้างอาคารคงที่ แต่จุดเกิด Cover ต้นไม้ Loot และรูปทรง Zone เปลี่ยนตาม seed ตัวละครใช้ค่าพื้นฐานใกล้เคียงกัน ความเสียหายและเวลาของการโจมตีไม่ใช้การสุ่มยิงโดน

ทุกแมตช์สุ่มจุดเกิดใหม่ทั้งสามด่าน กระจาย 8 ตัวละครห่างกันอย่างน้อย 8 ช่องแบบระยะตรง และสุ่มสลับผู้เล่น/บอตกับจุดเหล่านั้น จุดเกิดเว้นขอบด่าน มีช่องรอบตัว 3×3 ที่เดินได้และไม่มีน้ำ เชื่อมถึง Beacon ผ่านเส้นทางเดินจริง และไม่มีใครเริ่มทับ Supply Beacon ทุกคนมีกระสุนห่าง 1 ก้าวกับปืนห่าง 2 ก้าวเท่ากันโดยไม่เจาะกำแพงเพื่อวางของ

Solo ใช้ seed ใหม่เมื่อเริ่มแมตช์ ส่วน LAN ให้เซิร์ฟเวอร์สุ่มและส่งจุดเกิดของแต่ละคนผ่าน Fog ตามเดิม การกลับเข้าห้องไม่สุ่มตำแหน่งใหม่ และ Replay เก็บตำแหน่งจริงตั้งแต่เริ่มเกม ใช้ seed เดิมจะได้จุดเกิดเดิมเพื่อจำลองแมตช์ซ้ำได้

กล้อง Follow ให้ตัวละครอยู่กลางจอแม้เกิดใกล้ขอบด่าน เพื่อให้มองเห็นตัวและพื้นที่ออกคำสั่งโดยไม่ทับ HUD; FIT MAP และการเลื่อนกล้องเองยังใช้ขอบเขตสนามตามเดิม

Zone เป็น contour ไม่สมมาตรที่เตือนล่วงหน้า ยังไม่มีตัวตรวจความเชื่อมต่อ Safe Area เต็มรูปแบบ Guard ลดความเสียหายรอบตัวในช่วงคำสั่ง และการเห็นต้นไม้ยังใช้กฎ Vision พื้นฐาน จึงเป็นกติกาที่ลดขนาดจากแบบเกมเต็ม

## โครงสร้าง

- `engine.js`: simulation แบบ deterministic, ticks 45 ms (80 ticks / 3.6 วินาที), collision, projectiles, damage, bots และ Zone; ใช้ได้ทั้ง Node และเบราว์เซอร์
- `game.js`: UI, Canvas, input, particles, match loop และ replay
- `motion.js`: animation เดินระหว่างช่อง กล้องตามตัวละครและ Replay แบบต่อเนื่อง; ใช้ตำแหน่งที่มองเห็นเท่านั้น
- `presentation.js` / `effects.js`: ตัวละครและแผนที่ในเมนู ไอคอน SVG การตั้งค่าภาพ และ Particle Pool ที่จำกัดจำนวนและเคารพ Fog
- `tactics.js`: ประเมินข้อจำกัด ขอบเขตเดิน ระยะโยน จุดชนกระสุน และทรัพยากรที่จองในแผน โดยไม่เปลี่ยน simulation
- `audio.js`: procedural stereo SFX, master gain และ compressor
- `replay.js`: บันทึกสถานะแมตช์และเหตุการณ์แต่ละ tick, ใช้ภาพ Terrain ร่วมกันเมื่อไม่มีการเปลี่ยนแปลง, คำนวณตำแหน่งเริ่ม Action และจุดเริ่มเทิร์น
- `style.css` / `replay.css` / `hud.css` / `presentation.css` / `index.html`: หน้าจอเต็ม viewport, floating HUD, ห้องและ replay
- `server.js`: HTTP static server, API, WebSocket ที่บีบอัดข้อความ, SSE สำหรับ client เดิม และการตรวจ Origin ของ tunnel
- `multiplayer.js`: ห้อง ตัวละครผู้เล่น server-authoritative combat, ตรวจแผน, fog filtering และ replay หลังจบ
- `network.js`: client API, WebSocket/WSS, reconnect token และลิงก์ออนไลน์ / LAN
- `online-config.js` / `tools/online.js`: ตรวจ URL สาธารณะ เปิด/ปิด tunnel, ดาวน์โหลด client ที่ตรวจ checksum แล้ว และเลือก Cloudflare/ngrok
- `wire.js`: ส่งแผนที่ที่กรอง Fog แล้วครั้งแรก จากนั้นส่งเฉพาะช่องที่เปลี่ยน เพื่อลดข้อมูลผ่าน tunnel; รองรับ client เดิมด้วย
- `tests/online.test.js`: WebSocket สองผู้เล่น การบีบอัดข้อความ Fog คำสั่งที่ตรวจโดยเซิร์ฟเวอร์ Origin ของ proxy การกลับเข้าห้องและลิงก์ HTTPS
- `tests/multiplayer.test.js`: ห้อง การตรวจคำสั่ง ความเป็นส่วนตัวของสถานะ supply drop และ HTTP/SSE สองผู้เล่น
- `tests/lobby-spectate.test.js`: สิทธิ์เลือกด่าน/แก้โปรไฟล์ Spectate ตาม Fog การออกจากแมตช์และรหัสห้องใหม่
- `tests/engine.test.js`: ทดสอบกติกาที่มีเหตุการณ์เกิดพร้อมกัน
- `tests/replay.test.js`: ทดสอบภาพย้อนหลัง เหตุการณ์ที่ไม่ซ้ำ ตำแหน่งเริ่ม Action และประวัติตั้งแต่เริ่มจนมีผู้ชนะ
- `tests/tactics.test.js`: ตรวจไฮไลต์เทียบเส้นทาง engine และ validation ของเซิร์ฟเวอร์ รวมถึงน้ำ มุมกำแพง ระยะโยน ของที่รอเทิร์นถัดไป และ Fog
- `tests/spawn.test.js`: ตรวจจุดเกิดทุกด่าน ระยะห่าง ทางออก การเชื่อมถึง Beacon ของเริ่มต้น การสุ่มสลับตัวละคร seed และ LAN/replay
- `tests/operators.test.js`: ตรวจไฟคุมพื้นที่ การหนีไฟ การสะท้อนกระสุน การหมดสกิล สกิลบอต คูลดาวน์ การตรวจแผน LAN และ Fog/replay ของสกิลใหม่
- `tests/motion.test.js`: ตรวจความต่อเนื่องของการเดิน การเปลี่ยนเป้าหมาย Blink กล้อง และการล้างตำแหน่งศัตรูเมื่อพ้นสายตา
- `tools/browser-smoke.js`: browser QA ผ่าน headless Edge ใน Windows; ต้องเปิด local server ก่อน
- `tools/resolution-smoke.js`: ตรวจ Lock → Resolution, Replay, เล่นจนมีผู้ชนะ และเปิดแมตช์ล่าสุดจากเมนู; cinematic-smoke.js เป็นคำสั่งเก่าที่เรียกตัวทดสอบใหม่นี้
- `tools/multiplayer-smoke.js`: ผู้เล่นสองแท็บผ่าน UI จริง แยกตัวละคร synchronized turns, fog, Tab log และกลับเข้าตัวละครเดิมหลัง reload
- `tools/constraints-smoke.js`: ตรวจไฮไลต์ เหตุผลบล็อก และการคลิกจริงทุกคำสั่ง รวมถึง desktop/mobile
- `tools/motion-smoke.js`: วัด Resolution 3.6 วินาทีจริง การเดินสองคำสั่ง กล้อง Follow และการคืนสถานะหลัง Replay
- `tools/online-probe.js`: ใช้ `GRIDFALL_TEST_URL` วัดเวลารับสถานะและขนาดข้อมูลผ่าน tunnel จริง โดยสร้างห้องทดสอบแยก

## ตรวจสอบ

```powershell
node --test tests/*.test.js
node tools/browser-smoke.js
node tools/resolution-smoke.js
node tools/visual-smoke.js
node tools/multiplayer-smoke.js
node tools/multiplayer-smoke.js --replay
node tools/lifecycle-smoke.js
node tools/constraints-smoke.js
node tools/motion-smoke.js
node tools/countdown-smoke.js
```

Engine tests ตรวจการชนและโจมตีพร้อมกัน Free Aim ระยะกระสุน Slash การเก็บของอัตโนมัติระหว่างเดิน การรอใช้ทรัพยากรจนเทิร์นถัดไป กระเป๋าปืนและกติกาที่ใช้ร่วมกับบอต Barricade และแมตช์บอตบนทั้งสามด่าน

Browser QA ตรวจ Free Aim ปุ่มลัด Q Undo การเดินเก็บของและการรอใช้เทิร์นถัดไป การเก็บและเปลี่ยนปืน ด่านแนวนอน/แนวตั้ง กล้อง Resolve Replay mute/unmute help หน้าจอ 1440×900 และ 1280×720 ที่ไม่ต้องเลื่อนหน้า layout มือถือ และ JavaScript exceptions รวมถึง render เสียงด้วย OfflineAudioContext เพื่อตรวจว่ามีสัญญาณเสียงจริง

ภาพตรวจหน้าจออยู่ใน `qa/` ตัวทดสอบเบราว์เซอร์ใช้ profile ชั่วคราวแยกจาก profile ส่วนตัว และปิด browser process ของตัวเองหลังจบ

รัน Browser QA ตามลำดับ เพราะใช้พอร์ตทดสอบเดียวกัน ตรวจ gameplay เดิม Resolution และ Replay ที่รักษาหมอก replay จนมีผู้ชนะ multiplayer สองผู้เล่น และไฮไลต์ข้อจำกัดของคำสั่ง

ตัวเลือก `--replay` เปิดเซิร์ฟเวอร์ทดสอบชั่วคราว และจัดสถานการณ์ยิงครั้งสุดท้ายที่กำหนดได้ ตรวจว่าผู้ชนะเกิดจาก damage จริง, history มีครบสองเทิร์น, เปิด replay ทั้งสนามได้หลังจบ และ JOIN หลังจบยังดูทั้งแมตช์ได้ โดยไม่เปลี่ยนห้องบนเซิร์ฟเวอร์เล่นจริง

## Visual Upgrade / Build 1.1

จังหวะการต่อสู้ใช้ 80 ticks × 45ms = 3.6 วินาที คำสั่งสองเริ่มที่ 1.8 วินาที ค่าเริ่มต้นวางแผน 20 วินาที แถบ Countdown ใต้สถานะเทิร์นลดตามเวลาจริง ใช้สีเขียวตอนวางแผน เหลืองเมื่อเหลือ 5 วินาที แดงเมื่อเหลือ 2 วินาที และฟ้าระหว่าง Resolution พร้อมขีดแบ่งสองคำสั่ง Multiplayer ใช้เวลาห้องจากเซิร์ฟเวอร์

ทุกปืนสุ่มมุม Recoil ภายใน ±ค่าที่กำหนด: Pistol 1°, AR 2°, Shotgun 2.5°, SMG 4°, LMG 5°, DMR 0.7°, Revolver 1.5°, Sniper 0.25° ใช้การกระจายที่เน้นใกล้จุดเล็ง แต่ละนัดสุ่มใหม่จาก Seed/เทิร์น/Tick/ผู้ยิง ทั้งบอตและผู้เล่นใช้ Engine เดียวกัน ระยะ Damage และจำนวนกระสุนเดิม Preview แสดงขอบเขตมุมคลาดเคลื่อน เส้นกลางเป็นแนวเล็งโดยประมาณ Replay เก็บผลยิงจริง

เมนู Command มี Operator Showcase วาดด้วย Canvas จากรูปทรงที่ใช้ร่วมกัน สีและเอฟเฟกต์เฉพาะทั้งห้าตัว ข้อมูล Move/HP/Loadout อ่านจาก Engine เลือกด่านผ่าน Preview Terrain จาก Seed คงที่ ล็อบบี้แสดงช่องผู้เล่น HOST และ LINKED ตามสถานะจริง

HUD ใช้ Design Tokens ใน presentation.css, SVG ไอคอนเส้น, Action Bar, แผนสองคำสั่ง, Ghost ของตำแหน่งอนาคต, Highlight แบบมุมช่อง และเหตุผลจาก tactics.js ปืนมี Recoil สุ่มตามชนิดปืนใน Simulation และภาพตอบสนองตามมุมยิงจริง เอฟเฟกต์ Shield/Reflect/Blink/Scan/Roll/Death อยู่เฉพาะพื้นที่ตาม Fog

เอฟเฟกต์ Particle ใช้ Pool 240 ช่องใน effects.js ปุ่ม Settings มี Reduced Motion และ Camera Shake (ปิดเริ่มต้น) เคารพ prefers-reduced-motion ไม่มีเสียงเพลงหรือ Asset ภายนอก Replay แมตช์ล่าสุดอยู่ใน RAM ของแท็บหลังกลับเมนู และเปิดทั้งสนามได้เฉพาะแมตช์ที่จบแล้ว

Visual QA ครอบคลุม 1920×1080, 1366×768, 1280×720, 390×844, 412×915 และ Mobile Landscape ภาพอยู่ใน qa/upgrade-*.png


## Platform Arenas / Operator Rebrand

แมพสร้างด้วย Seed เป็นห้องพัก 5×5 พร้อมส่วนต่อขยายที่สุ่ม เชื่อมด้วยสะพานหนึ่งถึงสองช่อง มีโครงข่ายเชื่อมถึงกันและอย่างน้อยหนึ่งเส้นทางวน ตรวจจุดเกิดแปดคนแยกกันอย่างน้อยแปดช่องพร้อมของเริ่มต้น ทางหนีวงใช้ระยะทางตามเส้นทางจริงจากจุดสุดท้าย จึงยังมีทางเชื่อมระหว่างแพลตฟอร์มที่เหลืออยู่

ช่องลายเหลืองดำเตือนก่อนหล่นสองเทิร์น ส่วนสีดำคือ Void ที่เดินไม่ได้ เมื่อพื้นหล่นคนที่ยืนอยู่จะถูกกำจัดทันที ไม่ใช่ damage zone ผ่านโล่ สถานะแมพและ Replay คำนวณจากเซิร์ฟเวอร์ และไม่เผยตำแหน่งผู้เล่นนอก Fog

Operator IDs remain compatible with saved selections and rooms. STRIDER walks 4 tiles and dashes 5, ignoring movement debuffs. WRAITH can Blink twice in one turn, then has a two-turn cooldown. ORACLE scans 14 tiles through concealment for two turns, reduces recoil by 65%, adds 15 first-bullet damage and extends all weapon ranges by 25%. CINDER ignites a 4×4 impact area for two 12-damage burn ticks per turn over two turns. AEGIS gains 12 shield and reflects every incoming bullet at full damage, absorbing 80% and taking 20%. MIRE roots walking inside a 4×4 field for two turns. HALO restores 16 HP and 12 shield per turn in a 3×3 field for two turns. Each skill use costs one action; skills do not protect against falling into Void.

ใช้ tools/balance-report.js จำลองแมตช์บอตรวม Fate Draft บนทั้งสามขนาด เก็บผลใน qa/platform-balance.json ผลจำลองไม่แทนการทดสอบกับผู้เล่นจริง

Browser QA เพิ่ม: node tools/platform-smoke.js ตรวจลายเตือน พื้นหล่นจริง ตก Void และเอฟเฟกต์สกิลครบทั้งห้าตัว

### Multiplayer roster
Each player types a personal callsign before creating or joining a room. Names and operators can be edited only by their owner in the lobby. The host can add or remove bots from 0 to the available slot count; humans and bots total at most 8, with at least 2 required to start. New humans displace bots when full. Empty slots do not enter the match or generate starter loot. Spawns are chosen by the server for the actual roster, at least 8 cells apart with open dry exits, reachable supplies and preference for cover from starting sight lines.

### Action effects upgrade
Movement uses short, fading operator-colored light trails sampled from interpolated visual positions. Layered effects cover skills, shooting, slash, healing, reload, equipment changes, guard, smoke, pickups and explosions. Trails are capped at 384 segments, expire after 0.58 seconds, clear on replay seeks and hidden enemies, and disable under Reduced Motion. Action effects are clipped to visible cells; replay pause and speed also control cosmetic animation time. Simulation timing and multiplayer commands are unchanged.

The main battlefield feeds movement animation at every simulation step, including frames that process several ticks. Bullets and thrown objects interpolate between known positions in Solo, Multiplayer and replay; impacts, concealment and turn changes remove their tracks immediately. Public bullet snapshots retain their existing privacy rules. Terrain outside the camera is omitted from drawing, while visible tiles retain full detail. Without Smoke, actor and terrain sight share the same computed field. Combat still uses the original 45 ms simulation ticks.

### FATE DRAFT — Every Gift Has a Price

The mystery action/effect rules are completely replaced. Before planning T4, T8, T12 and every fourth turn thereafter, living players and bots enter a separate 16-second draft. Choose one of two cards; timed-out or disconnected players receive an automatic choice. Cards last for the match and pair a blessing with a curse. The pool has 28 normal, 8 manipulation, and 5 legendary contracts. Early offers have Mild costs; Moderate/special choices unlock at T8, Severe at T12, and legendary chaos at T20. Curse Transfer is especially rare and starts at T16.

Special choices implement reroll, a third offer next draft, gifting paired cards, curse transfer, random paired exchange, shared fate, balanced cleanse and paired theft. Legendary choices include doubled blessing/curse, random mirroring, three-card rebirth, double down and three 75%-strength wild contracts. T12 Double Deal accepts two cards with both costs (a third offer allows choosing the second card); T16 Black Market highlights public build inspection; T20 Sacrifice gives up a blessing for three rerolled offers. Rerolls never extend the timer.

Multiplayer stores offers and pending choices only on the server. Each client receives its own offers and confirmation; builds and summaries change only when the draft seals. All players see the same two-second reveal before planning resumes on the same numbered turn. Skip affects animation only; it cannot bypass the multiplayer reveal barrier. Reconnect restores private offers and locked choice. Public inspection contains names, operators, alive status and cards, never positions, ammo or hidden terrain. Conflicting steals/transfers resolve in stable player-ID order; an already taken card cannot be duplicated.

Shared combat modifiers govern simulation, validation and previews: integer Move 1–5, ranged multiplier 0.7–1.45, with a separate final-volley bonus capped at +45%, at most three positive ranged damage tags, maximum shield 10–90, Medkit 10–65 HP, melee at most 70, blast radius 1–2, and bounded recoil/timing bonuses. Action HP taxes stop at 1 HP; enemies and Void can still finish you. Scavenger ammo waits until the next turn. Card power budgets pair +3/−3, +4/−4 or +5/−5 according to severity. This is a starting balance model for playtesting.

Responsive cards show English green bonuses/red drawbacks, icons, rarity, severity, tags, target selectors, a countdown bar and skippable acceptance. The compact FATE HUD opens every public build, including during replay; snapshots preserve builds and public draft history without private offers. Draft start, arrival, hover, selection, flip, blessing, curse, special and legendary choices have separate quiet procedural audio cues.

Bots use seeded weighted decisions from visible contacts and recent memory. They vary shooting, flanking, retreating, guarding, healing, reloading, smoke, grenades and skills, while prioritizing escape from falling platforms. They never read hidden opponents or locked plans.

The new Field Manual supports hover, keyboard focus and mobile tap on eight actions, seven skills and nine weapons. Operator portraits have unique helmets and equipment, animated selection, and battlefield bodies face actual movement or aim with smooth shortest-angle rotation. Death dissolves into fragments before the result panel opens. Platform warnings use a quiet low sine/wind cue with a cooldown; falls use a separate low rumble instead of repeating square beeps.

QA: npm test; node tools/interface-smoke.js; node tools/fate-smoke.js; node tools/visual-smoke.js; node tools/multiplayer-smoke.js --replay.

### Interface and operator update
The game interface, operator descriptions and card text use English. Card descriptions use bonus/drawback language. Draft time is 16 seconds in solo and server rooms.

Actions form a vertical column on the right. Two stable action slots sit at bottom center and receive a short icon flight when queued, with subtle confirm/new-turn pulses. Inventory and weapon magazines stay visible. The FATE button and public card inspector sit lower left. Live minimap and overview replay controls are removed; full match replay remains available after the winner, with player cameras. Exit asks for confirmation; Cancel preserves the match. Solo pauses during confirmation, while multiplayer time continues. Reduced Motion skips decorative action flights. The manual has all 41 cards with hover, focus and tap details.

## Drag Movement / Contact Duel

- Move และ KINETIC DASH: คลิกช่องปลายทางเพื่อให้ระบบเลือกเส้นสั้นที่สุดที่เดินได้ หรือคลิกซ้ายค้างที่ตัวละคร (คำสั่งที่สองใช้เงาที่ปลายทางแรก) แล้วลากขึ้น ลง ซ้าย ขวา ปล่อยเพื่อวางแผน ทั้งสองแบบเดิน 4 ทิศ ไม่มีการเดินทแยง
- Bubble ตัวเลขเหนือหัวตัวละครหรือเงาต้นทางแสดงระยะที่เหลือ น้ำยังใช้ระยะ 2 ต่อช่อง ลากกลับช่องก่อนหน้าเพื่อลบก้าวและคืนระยะ ลากกลับถึงต้นทางแล้วยกเมาส์จะไม่เสีย AP หรือกด Q / Escape เพื่อยกเลิกเส้นปัจจุบัน
- เซิร์ฟเวอร์ตรวจและเก็บเส้นที่ลากจริง ไม่เปลี่ยนเป็นเส้นที่สั้นที่สุด Bot ใช้เส้นเดิน 4 ทิศเช่นเดียวกัน PHASE SHIFT ยังคงเป็นการเลือกจุดวาร์ปตามระยะและสายตา
- ตัวละครเดินถึงจุดชนจริงก่อนเกมหยุดตัดสินเป่ายิ้งฉุบ รองรับช่องปลายทางซ้ำ การเดินสวนกัน และผู้ที่ยืนขวาง ทางเดินที่ว่างตามขบวนและวงวนยังเดินพร้อมกันได้
- มีเวลาเลือก 6 วินาที มือทั้งสองฝ่ายถูกปิดไว้จนเลือกครบ ผลเปิดเป็นการ์ดสองใบ 1.5 วินาที ชนะเขียว แพ้แดง เสมอสีปกติ ทุกคนหยุดรอทั้งช่วงเลือกและเฉลย เสมอให้เลือกใหม่หลังเฉลยจบ หมดเวลาเลือกมือให้แบบสุ่ม ผู้ชนะยึดช่องปะทะแล้วเดินต่อ ผู้แพ้เสีย HP 5 โดยตรง (Shield ไม่ลด), มีภาพผลักและเสียงปะทะ แล้วหยุดคำสั่งเดินปัจจุบัน แต่คำสั่งถัดไปยังทำงานจากตำแหน่งจริง
- ผู้แพ้ถูกดันไปช่องข้างจุดปะทะแบบสุ่ม 4 ทิศ ตัดกำแพง Barricade Void และคนอื่นออกจากตัวเลือก ถ้าไม่มีช่องว่างจะหยุดที่จุดชน ไม่ดันลง Void หรือให้ยืนซ้อนกัน ไม่มีดาเมจเพิ่มจากการชน
- ชนหลายคนตัดสินเป็นคู่ต่อเนื่อง ทุกคนที่ไม่ได้ร่วมดวลรอโดยไม่เห็นตำแหน่งที่อยู่นอกสายตา บอตเลือกมืออัตโนมัติ รองรับ reconnect และการออกจากห้องกลางการดวล

Validation: `tests/movement-clash.test.js`, `tools/movement-smoke.js` (actual mouse gestures, two browsers, Thai/English, sealed choices), `tools/motion-smoke.js` (4-second active timeline and smooth follow).

Grenade / Smoke แสดงวัตถุหมุนตามวิถีโค้งและ trails จาง ๆ กระป๋อง Smoke ใช้เวลา 0.5 วินาทีก่อนลงพื้น ระเบิด 0.7 วินาทีก่อนระเบิด ควันครอบคลุม 3×3 ช่องตรงตามพื้นที่บังสายตา ภาพควันถูกจำกัดด้วยสายตาผ่านภูมิประเทศและไม่เปิดเผยผู้เล่นที่ซ่อนอยู่

ผลเป่ายิ้งฉุบแสดงสีบนการ์ดมือที่เลือกใบเดิมตรงกลางจอ: ชนะเขียว แพ้แดง เสมอสีปกติ พร้อมแสดงมือคู่ต่อสู้ด้านล่าง ช่องที่ใช้คำสั่งได้มีสีเขียวและขอบชัดขึ้น เส้นเดินเป็นเส้นต่อเนื่องพร้อมจุดแต่ละก้าวและวงปลายทาง การลากเพิ่มช่องที่เดินได้มีเสียง pop เบา ๆ เฉพาะก้าวที่เพิ่มสำเร็จ การลากย้อนหรือชนช่องบล็อกไม่เล่นเสียงซ้ำ เสียงเคารพปุ่ม Mute และระดับเสียงเดิม

Line of Sight ใช้ ray casting แบบต่อเนื่องจากขอบกำแพง/รั้วและพื้นที่ Smoke จริง เงาเป็น polygon ไม่ตัดเป็นช่อง Enemy ถูกตรวจการโผล่ของ body radius 0.32 ตรงกับ projectile collision และ sprite ถูก clip ให้เห็นเฉพาะส่วนที่อยู่ในสายตา Server ใช้สูตรเดียวกัน ส่งเฉพาะศัตรูที่เห็นแม้ศูนย์กลางจะถูกบัง ไม่ส่ง inventory หรือแผนของศัตรู พื้นสนามจำเฉพาะส่วนที่ส่องถึง และ Blink ยังต้องเห็นจุดกึ่งกลางปลายทาง

เครื่องหมายเปิดเผยสีม่วง (REVEALED) คือข้อเสีย Trailblazer เผยตำแหน่งหนึ่งเทิร์น ข้อความ SIGNAL เดิมถูกเปลี่ยนให้ชัดเจน เครื่องหมายเห็นล่าสุด (LAST SEEN) คือร่องรอยตำแหน่งที่เคยเห็น คงไว้สูงสุดสามเทิร์น ไม่อัปเดตตามศัตรูที่เข้าหมอก ไม่แสดงซ้อนตัวที่ยังมองเห็น หรือจุดเดิมที่กลับมองเห็นแล้วว่าง


### Background soundtrack and audio mix

Circuit Tactics.mp3 uses a single decoded PCM source with a 1.2-second equal-power loop seam. The original intro plays on entry; subsequent repeats use the seamless loop region. Entering a solo or multiplayer match restarts the track from the beginning with a short fade, without downloading it again. Reconnecting within the same match does not restart it.

Settings and the in-game Audio panel share independent Effect Volume (default 100%) and BG Music Volume (default 30%) sliders with percentage readouts. Values are saved together on this browser. Effects use their own gain bus, so turning effects down never turns music down. The global Sound switch mutes both without resetting either value. Music is mixed quietly, briefly ducks for audible combat, and fades out in hidden tabs.

Accepted actions fly into the bottom-center plan slots in 620 ms with a faint trail, a soft landing ring and confirmation tone. Selection is registered immediately. Undo, Confirm, leaving the match, and new match packets cancel pending effects; old animations cannot confirm a replacement action. Reduced motion keeps a brief slot highlight and sound without the flight.


Main-menu hover uses quiet terminal ticks and a distinct confirmation blip. Hover fires once on entering a button, ignores touch and disabled controls, and is rate-limited. Keyboard focus gets the same cue; Up/Down and Home/End navigate the sidebar. A subtle >_ cursor marks hover/focus/current selection, and reduced motion disables the lateral movement. Master mute/volume control all menu sounds.

## Arsenal / field update

- Real matches start every player and bot with only P9 / SIDEARM (8 rounds). Other weapons must be collected from the battlefield and become available next turn; practice still provides all guns to try.
- Every five-turn Supply Drop scatters up to ten items across randomly selected surviving dry tiles, with two Medkits in a full drop. It includes one TRIDENT, three other guns, ammo, armor, a grenade and Smoke. Drops never overwrite uncollected items or spawn on actors, walls, water or fallen platforms; sparse surviving islands receive as many items as fit.
- Supply Beacon starts at a random safe, empty tile and relocates after its five-turn recharge or if its platform collapses. It grants +30 reserve ammo, +20 armor, +1 grenade and +1 Medkit next turn, respecting inventory caps. Drops leave the Beacon tile clear. If no safe empty site remains, the Beacon stays unavailable until one opens. Practice retains its fixed training Beacon.
- Resolution: 80 ticks × 45 ms = **3.6 seconds**; Action 2 starts at 1.8 seconds. Planning time stays selectable.
- BREACHER (Shotgun): eleven evenly spaced pellets per shell; strongest at close range. Damage on one actor remains capped at the strongest pellet hit (48 / 32 / 16 with range falloff, before bonuses). Floating damage combines the pellets from one shell into one total, while separate shots use spaced text lanes. Reflected pellets retain their shell damage cap.
- Shooting guides and bullet flight share exact body/terrain intersections. Grazing markers are dashed when recoil can miss; targets can still move or dodge. Pellets stop their guides at the first known hit. Expired bullets are removed with a small floating-point tolerance, and resolution clears remaining flight before planning or match-end snapshots.
- TRIDENT: three rays per round, range 9, magazine 6. Appears in every five-turn Air Drop and never in starter loot; maximum base damage 28 per target per shot. Auto pickup still becomes usable next turn.
- MIRE / STASIS FIELD: throw range 5, 4×4 area, lasts two turns. Everyone inside is rooted and cannot walk. An entering walking route stops on its first field tile; Dash and Blink can escape. Cooldown 4 turns.
- HALO / MEND FIELD: throw range 5, 3×3 area, lasts two turns. Restore 16 HP and 12 shield per turn; heals allies only in Team Mode and everyone inside in Free for All. Respects HP / shield caps. Overlapping fields do not stack. Cooldown 4 turns.
- THERMITE FIELD, STASIS FIELD and MEND FIELD fly as visible canisters with faint trails before landing. Their flight, deployment and fields are recorded in replays. Multiplayer filters them through the observer's sight.
- VERDANT, BADLANDS and TUNDRA palettes add coherent grass patches to all three procedural sizes. Terrain cost, connectivity, loot, spawn safety and falling platforms use the same rules.
- Rifle / SMG / LMG recoil grows within each burst, with lower reliability around six tiles. ORACLE focus and recoil cards still apply.
- Main menu includes all seven operator previews; the English manual covers all skills and guns via hover, focus or tap.

Validation: `npm test`; `node tools/arsenal-smoke.js` checks the menu, manual, field throws, movement limit, weapon spread and two browser multiplayer clients.

## Standalone Bot Arena

Run `npm run bots` to open the separate spectator page in your browser. Choose any two operators, optionally choose their starting weapon and enable automatic Fate drafts, then click **Start duel**. Pause/resume, 1×/2×/4× speed, Reset and Rematch are available. Both bots use the original AI and combat engine on a symmetric 15×11 arena; there is no immortal player or platform collapse. P9 is the default loadout and other weapons can be collected. A duel ends on elimination or a draw after 40 turns.

The launcher binds to localhost on an available port. `npm run bots -- --no-browser` prints the link without launching a browser. With the normal game server running, visit `/bot-arena.html`. You can also open `bot-arena.html` directly in a browser; all scripts and visuals are local and no multiplayer connection is needed. Arena setup is in `bot-arena.js`; the page and spectator controls are in `bot-arena.html`, `bot-arena.css` and `bot-arena-view.js`.

ตรวจหน้า Lobby ด้วยสองเบราว์เซอร์: `node tools/lobby-visual-smoke.js` ทดสอบคลิกเลือก/ยืนยันตัวละคร ปรับบอท สิทธิ์ Host ภาษา การเชื่อมต่อใหม่ Reduced Motion และจอ Desktop / Laptop / Mobile / Landscape

Multiplayer: บอทสุ่ม Operator จากทั้ง 7 ตัวเมื่อเริ่มแมตช์ หน้า Lobby ไม่บอกตัวละครบอท ปุ่ม START MATCH ล็อกและขึ้น “กำลังเข้าสนาม…” จนได้รับสนามจากเซิร์ฟเวอร์ การอยู่ในเมนูหรือ Lobby จะหยุดวาดสนามเบื้องหลัง และการเริ่มแมตช์ไม่สร้างแมพซ้ำในเบราว์เซอร์

หลังแก้ไฟล์ฝั่งเซิร์ฟเวอร์ ใช้ `npm run online:fresh` เพื่อเปิดโค้ดล่าสุดและรับลิงก์ใหม่ หรือปิดเซิร์ฟเวอร์ / online เดิมทั้งหมดด้วย Ctrl+C แล้วเปิด `npm run online` หรือ `npm start` ใหม่ ก่อนกด Ctrl+F5 ทุกเบราว์เซอร์ `online:new` เปลี่ยนลิงก์แต่ยังใช้เซิร์ฟเวอร์ที่เปิดอยู่ จึงไม่โหลดตัวละครใหม่แทนการรีสตาร์ท API health บอก Operator ที่เซิร์ฟเวอร์รองรับ เพื่อป้องกันเลือกตัวใหม่แล้วถูกเปลี่ยนเป็น STRIDER โดยไม่แจ้ง

## ส่งไปเล่นอีกเครื่อง (Windows 64-bit)

ใช้ `npm run package:windows` เพื่อสร้าง ZIP ใน `dist` ชุดนี้รวม Node.js, ws, เพลงและ cloudflared พร้อมใบอนุญาต ไม่รวมรายชื่อห้องหรือลิงก์ออนไลน์ของเครื่องนี้ เครื่องปลายทางแตก ZIP ทั้งหมด แล้วเปิด `INSTALL.cmd` ตรวจไฟล์ จากนั้นใช้ `PLAY.cmd` เล่น Solo / LAN หรือ `ONLINE-FRESH.cmd` เปิดเซิร์ฟเวอร์พร้อมลิงก์ใหม่ คู่มืออยู่ใน `START-HERE.txt` ผู้เล่นที่เข้าห้องเพื่อนใช้เบราว์เซอร์ได้เลย

Online launch verifies the public game page and an authenticated WebSocket before showing `GRIDFALL ONLINE READY`. `ONLINE-FRESH.cmd` then opens that verified URL in the browser. Keep its window open while playing. If the URL cannot be opened, run `ONLINE-CHECK.cmd` alongside the launcher and send its output; it checks the local server, public page and room connection.

Room lifecycle: eliminated players can return to the same lobby while the match continues. Completed matches return after 6.5 seconds unless viewing a replay or dialog. Room invitations and profiles persist for rematches. Host can kick other members. Page exit removes membership immediately; lost connections and unused reservations expire after a 10-second reconnect grace. Lobby edits cannot interrupt active match views. Platform stripes are yellow for two remaining rounds and red for one; automatic gun recoil is reduced by about 20 percent. Main menu uses English mode labels and Manual / Settings icons.

Menu refinement: language uses two buttons instead of the system dropdown. Settings shows one heading and only language, Effect Volume and BG Music Volume. Back controls have explicit borders and 44px targets; Escape returns through menu steps. Removed menu audio-output, test/mute, camera-shake and reduced-motion controls. OS reduced-motion preference is still respected. The main menu uses a decorative platform scene and operator portrait inspired by the hierarchy of VALORANT and Apex Legends menus, without importing their assets. Browser checks: `node tools/settings-refine-smoke.js`.


## Operator balance and Fate combinations (2026-10-11)

- STRIDER: Kinetic Dash has a five-tile budget even under Stasis or Fate movement penalties. Each water tile costs one Dash step; normal walking still costs two. Charge collisions automatically win without a rock-paper-scissors pause, pushing enemies forward along the charge route and interrupting their current movement action. Every hit deals 5 HP damage, bypassing shield, including each subsequent push against the same enemy. Walls, Void or allies blocking the forward push stop the charge safely. Enemy chains push together when there is space; two simultaneous opposing Dashes stop each other and both take 5 HP collision damage. Later action slots still execute. Ordinary rock-paper-scissors damage remains 10 HP. Bullet evasion lasts the full Dash action. Cooldown remains two turns.
- WRAITH: queue up to two Phase Shifts in one turn, each consuming one action. Each destination must be visible and within five tiles of its projected origin. Using even one Blink starts a two-turn cooldown; the second Blink remains available in that same resolution.
- ORACLE: active Pulse Array extends every equipped weapon's range by 25%, including shotgun pellets and TRIDENT rays. Queuing Scan before Shoot previews the extended range. Scan still lasts two turns, does not make bullets pass walls, and preserves its recoil and first-bullet bonuses.
- CINDER: Molly ignites the 4×4 impact area. Burning still deals two 12-damage ticks per turn for two turns, follows victims, does not stack and leaves no ground fire.
- MIRE: the 4×4 Stasis Field roots walking while an operator is inside, including the caster. Shooting, healing and other actions remain available. Dash and Blink can escape. Duration is two turns and cooldown four turns.

Eight new paired cards add recoil, ammo, timing, melee, health, Smoke and Guard choices: Steady Hands, Extended Mag, Ammo Cache, Heavy Edge, Thick Skin, Panic Fire, Smoke Battery and Counterweight. Shoot timing is measured within an action; it never grants an extra action. Ammo Cache refunds up to eight actually loaded rounds to reserve; a full-magazine reload provides no refund. Extended Mag trades its extra Shoot capacity for one less tile of normal movement. Final Volley replaces the last-round bonus with a bonus to every bullet of the magazine's final Shoot. Its magazine penalty removes one complete Shoot action, so automatic guns do not leave unusable partial bursts. Mirror Plate trades its stronger Guard for a lower shield cap. Volatile charges its HP cost only on grenade throws.

Keep both named blessings to activate a combination once. Curses remain in effect. Removing or transferring a required blessing deactivates the combination. Scaled contracts proportionally scale the combination bonus, up to 100%; normal stat caps still apply. Build inspection shows active combinations and progress toward incomplete pairs; an offer that completes a pair shows its combo bonus before selection.

| Combination | Required blessings | Extra bonus |
| --- | --- | --- |
| Armored Reload | Fortress + Tactical Reload | Reload restores 4 more shield |
| Rescue Smoke | Smoke Medic + Field Surgeon | Smoke restores 5 more HP |
| Finishing Volley | Glass Cannon + Final Volley | Final Shoot bonus +10 percentage points |
| Breach Charge | Demolitionist + Volatile | Grenade damage +5 |
| Blood Duel | Berserker + Duelist | Successful Slash restores 5 more shield |
| Supply Chain | Scavenger + Extended Mag | Pickups grant 3 more reserve rounds next turn |

## Battlefield controls and practice

### Interactive training and teams

HOW TO PLAY offers Walkthrough and Free Mode. Choose any of the 23 lessons from the lesson picker, or use Previous, Skip and Retry. Animated keyboard prompts show the next input; only genuinely completed exercises count as practiced. Lessons cover camera controls, collecting ammo, manually drawn routes, Undo, all eight standard actions, combining two actions, all seven signature skills, and Fate Cards. The Guard lesson practices G → H → SPACE: Guard reduces incoming bullet and slash damage for the rest of that turn, including the Heal action, then expires. The practice Fate draft has no countdown and includes a return-to-lessons button. Free Mode restores unrestricted practice. Choose operators using the training cards and weapons using the normal lower-left loadout.

Signature Skill (E) appears at the top of the action panel, above Undo and the eight standard actions. Planning previews retain subtle corner outlines and render above Smoke and roofs; this does not reveal concealed opponents.

Singleplayer map setup and Multiplayer room setup offer Free for All or Team Mode. Teams A and B each support 1–4 operators, including bots. Players choose their own side in the lobby; the host can move bots with the team buttons. Blue A and orange B badges identify teammates, who remain visible to each other. Friendly fire is disabled; your own explosives can still hurt you. A team wins when no opposing operator remains alive. Teammate contact blocks movement instead of starting a duel, and two teammates can swap tiles.

ORACLE reveals operators within 14 tiles through walls, Smoke and roofs for two turns; bullets still collide with walls. AEGIS reflects every incoming bullet during its active turn at full return damage, absorbs 80%, and receives the remaining 20%. HALO restores 16 HP and 12 shield per turn in its existing 3×3 field for two turns, respecting caps and without stacking overlapping fields; in Team Mode it heals allies only. STRIDER dodges every bullet for the entire Dash action, including its start and end; melee and explosions still apply.

Edit lesson content and progression in `walkthrough.js`, training controls in `practice-ui.js`, and their layout plus the compact lobby in `training-team.css`. Match rules are in `engine.js`, visibility in `vision.js`, and room/team validation in `multiplayer.js`. `index.html` defines the menus. The static server and Windows packager include both new training files. These changes must be included in your next Render deployment to update the hosted game.

Hold WASD or the arrow keys to pan smoothly. Release to stop; press C to follow your operator again. Mouse wheel zooms; right or middle drag pans. Select MOVE (1), hold left click on your operator, drag through adjacent tiles, then release to queue a manual route. Q undoes the last action. SPACE confirms the plan. Action buttons show their keyboard shortcuts and remaining magazine rounds or supplies. A moving outline marks an available signature skill (E), and stops when it is queued, cooling down or unavailable. OS Reduced Motion uses a static outline.

The practice guide keeps Field guide and Reset arena as its two arena controls. Camera and movement instructions are available in the interactive Walkthrough; the separate Video lessons and Fate cards tabs have been removed. Fate Cards remain playable in practice and have their own Walkthrough lesson. Reset arena restarts the selected practice mode, while Try again restarts the current Walkthrough lesson.

Edit arena button appearance in `training-team.css`, general battlefield styles in `refinement.css`, action controls in `game.js`, and guide text in `practice-ui.js`. Existing video assets and their offline generator remain in the repository, but the practice guide no longer exposes a video tab.
