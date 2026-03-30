# 🌐 VPS Remote Execution Guide

## เป้าหมาย
รัน Trading Bot บน VPS เมื่อเครื่อง local ถูก block

---

## 🚀 Quick Start

### 1. สมัคร VPS
แนะนำ VPS Providers:
- **DigitalOcean** - $6/month (Singapore region)
- **Vultr** - $5/month (Singapore/Tokyo)
- **AWS Lightsail** - $5/month
- **Google Cloud** - มี free tier
- **Azure** - มี free tier

**Requirements:**
- RAM: 1GB+ (2GB แนะนำ)
- OS: Ubuntu 22.04 LTS
- Disk: 25GB+
- Bandwidth: 1TB+

---

### 2. ตั้งค่า VPS

SSH เข้า VPS และรันคำสั่ง:

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verify installation
node --version  # Should show v20.x.x
npm --version   # Should show 10.x.x

# Create directory
mkdir -p /root/iq-option-bot
cd /root/iq-option-bot
```

---

### 3. ตั้งค่า .env ในเครื่อง Local

แก้ไขไฟล์ `.env`:

```env
# IQ Option Credentials (ต้องเหมือนกับที่ใช้ใน VPS)
IQ_OPTION_EMAIL=your-email@gmail.com
IQ_OPTION_PASSWORD=your-password

# VPS Configuration
VPS_HOST=your-vps-ip-address
VPS_USER=root
VPS_PASS=your-vps-password
VPS_PORT=22
VPS_PATH=/root/iq-option-bot
```

---

### 4. วิธีใช้งาน

#### Option A: Auto-Deploy (แนะนำ)
```bash
# Bot จะ auto-deploy เมื่อ detect network block
node start_production.js live
```

#### Option B: Manual Deploy
```bash
# Test VPS connection
node vps-cli.js test

# Deploy only
node vps-cli.js deploy

# Deploy และ run พร้อม streaming
node vps-cli.js run

# หรือใช้ remoteRunner โดยตรง
node src/remote/remoteRunner.js deploy
```

---

### 5. คำสั่งจัดการ VPS

```bash
# ดู logs
node vps-cli.js logs 100

# ตรวจสอบสถานะ
node vps-cli.js status

# หยุด bot
node vps-cli.js stop
```

---

## 🔧 Fallback Chain

```
LIVE (Local) → VPS (Remote) → DEMO (Simulated)
```

1. **Local LIVE**: พยายามเชื่อมต่อ 50 ครั้ง
2. **VPS**: ถ้า local ไม่ได้ → auto-deploy ไป VPS
3. **DEMO**: ถ้า VPS ไม่ได้ → fallback ไป demo mode

---

## 📊 ตรวจสอบว่าใช้ VPS ได้จริง

Log ที่ควรเห็น:
```
🚀 VPS configured! Switching to remote execution...
📤 Uploading project files...
📦 Installing dependencies on VPS...
🚀 Running bot on VPS with streaming (Mode: LIVE)
[REMOTE] 📡 CONNECTED to IQ Option
[REMOTE] 📊 LIVE CANDLE: { asset: 'EURUSD', ... }
[REMOTE] 📤 SENDING ORDER: { ... }
[REMOTE] 🎯 RESULT: WIN +$1
```

---

## ⚠️ Troubleshooting

### 1. SSH Connection Failed
```
❌ ตรวจสอบ:
- VPS IP ถูกต้องไหม
- Firewall เปิด port 22 ไหม
- Password ถูกต้องไหม
```

### 2. Permission Denied
```bash
# ใน VPS รัน:
chmod 700 /root
chmod 755 /root/iq-option-bot
```

### 3. Node.js ไม่เจอใน VPS
```bash
# ติดตั้งใหม่
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

### 4. Bot รันไม่ได้ใน VPS
```bash
# SSH เข้า VPS และรัน manual:
ssh root@your-vps-ip
cd /root/iq-option-bot
npm install
node start_production.js live
```

---

## 🔒 Security Best Practices

1. **ใช้ SSH Key แทน Password**
```bash
# Generate key
ssh-keygen -t rsa -b 4096

# Copy to VPS
ssh-copy-id root@your-vps-ip
```

2. **เปลี่ยน Default SSH Port**
```bash
# ใน VPS
sudo nano /etc/ssh/sshd_config
# แก้ Port 22 เป็น Port 2222
sudo systemctl restart ssh
```

3. **ใช้ Firewall**
```bash
sudo ufw allow 2222/tcp
sudo ufw enable
```

---

## 💰 VPS ราคาประมาณ

| Provider | Price | Location | Speed |
|----------|-------|----------|-------|
| DigitalOcean | $6/mo | Singapore | ⭐⭐⭐⭐ |
| Vultr | $5/mo | Singapore | ⭐⭐⭐⭐ |
| AWS Lightsail | $5/mo | Singapore | ⭐⭐⭐ |
| Linode | $5/mo | Singapore | ⭐⭐⭐⭐ |

**แนะนำ:** DigitalOcean Singapore (เร็วสุดสำหรับเทรด IQ Option)

---

## 🎯 Success Criteria

- ✅ VPS connection OK
- ✅ Code deployed successfully
- ✅ npm install สำเร็จ
- ✅ Bot รันได้บน VPS
- ✅ เชื่อมต่อ IQ Option ได้
- 📊 ได้รับ candle data
- 💰 ส่ง order สำเร็จ
- 🎯 ได้รับ trade result

---

## 📞 ต้องการความช่วยเหลือ?

1. ตรวจสอบ logs: `node vps-cli.js logs 100`
2. Test connection: `node vps-cli.js test`
3. ตรวจสอบ .env ว่าตั้งค่าถูกต้อง
4. SSH manual เข้า VPS เพื่อ debug

---

**Ready to deploy! 🚀**
