import http from 'node:http';
import https from 'node:https';
import tls from 'node:tls';
import { X509Certificate } from 'node:crypto';
import { OUTBOUND_USER_AGENT } from '@/shared/config';

// 行政院主計總處統計網站的固定路徑 XML 下載檔案（ws.dgbas.gov.tw），不是正式 REST API——每份
// 統計表各自有自己的固定 URL（依資料集不同，見各 domain 的 service.ts），沒有查詢參數，只能整份
// 下載。格式統一是 <DataSet Sender_NAME="..." Tab_NAME="...">
// <Obs><Item>...</Item><TIME_PERIOD>...</TIME_PERIOD><FREQ>...</FREQ><TYPE>...</TYPE>
// <Item_VALUE>...</Item_VALUE></Obs>...</DataSet>，已用消費者物價基本分類指數(CPI)、GDP貢獻度
// 兩份真實檔案核對過格式完全一致（2026-09-02）。手動用 regex 解析，不引入 XML parser 套件——這個
// 格式扁平、沒有巢狀結構、沒有屬性要解析，不值得為此加依賴。
//
// ws.dgbas.gov.tw 這台主機的 TLS 憑證鏈本身有問題（2026-09-02 用 openssl s_client -showcerts
// 實測驗證過：伺服器送出的憑證鏈裡只有葉憑證（www.dgbas.gov.tw，簽發者 TWCA Secure SSL
// Certification Authority），沒有送中繼憑證——是主機自己沒送出正確的中繼憑證，不是我方憑證庫
// 缺漏）。curl 在 Windows 上能通，是因為 Schannel 會用 AIA(Authority Information Access)自動
// 另外抓正確的中繼憑證補完整條鏈；Node.js 的 fetch 預設不做 AIA chasing，所以會直接判定驗證失敗
// （UNABLE_TO_VERIFY_LEAF_SIGNATURE）。而且 Node 內建的 Mozilla 信任清單裡完全沒有 TWCA 系列的
// 根憑證（用 `tls.rootCertificates` 實測確認過，2026-09-14），所以就算補了中繼憑證，沒有根憑證
// 一樣過不了驗證。
//
// 修法（2026-09-14，取代原本的 rejectUnauthorized: false）：跟 tpex-ts 那邊處理同樣問題（TPEx
// 也是掛 TWCA 憑證）的做法一致——不關掉驗證，而是把「伺服器該送但沒送」的中繼憑證，跟 Node 信任清單
// 沒收錄的 TWCA 根憑證，一起補進 https.Agent 的 ca 清單，讓驗證照常跑、只是多給它兩張本來就該有的
// 憑證。這兩張憑證是從 ws.dgbas.gov.tw 葉憑證的 AIA 擴充欄位（CA Issuers URI）一路往上抓，
// 再用 `openssl verify -partial_chain` 實測驗證過完整鏈路（2026-09-14）：
//   葉憑證 -(TWCA_INTERMEDIATE_PEM)-> TWCA Secure SSL Certification Authority
//                    -(TWCA_ROOT_PEM)-> TWCA Global Root CA
// TWCA Global Root CA 本身其實是由更上層的「TWCA Root Certification Authority」簽發、不是自簽
// 根憑證，但瀏覽器/作業系統的信任清單一般也是直接把它當根憑證信任（不再往上追）——這裡採同樣做法。
// ca 陣列用 `...tls.rootCertificates` 展開 Node 內建清單再加這兩張，是「疊加」不是「取代」，不影響
// 這個 adapter 打其他 https 網址時的驗證行為；也只在這個 adapter 內生效，不影響其他 adapter
// （GCIS/CBC/FIA/NDC/SITCA）對外請求的憑證驗證，那幾個網域自己的憑證鏈都正常送出完整鏈（2026-09-14
// 用 openssl s_client 全部逐一驗證過 verify return code: 0）。

// 來源：https://sslserver.twca.com.tw/cacert/secure_sha2_2023G3.crt（TWCA Secure SSL
// Certification Authority，簽發 ws.dgbas.gov.tw 葉憑證的中繼 CA）
const TWCA_INTERMEDIATE_PEM = `-----BEGIN CERTIFICATE-----
MIIFxjCCA66gAwIBAgIQQAE0s2gAAAAAAAAM0KoI7DANBgkqhkiG9w0BAQsFADBR
MQswCQYDVQQGEwJUVzESMBAGA1UEChMJVEFJV0FOLUNBMRAwDgYDVQQLEwdSb290
IENBMRwwGgYDVQQDExNUV0NBIEdsb2JhbCBSb290IENBMB4XDTIzMTAxNjA5MDEw
NFoXDTMwMTAxNjE1NTk1OVowUzELMAkGA1UEBhMCVFcxEjAQBgNVBAoTCVRBSVdB
Ti1DQTEwMC4GA1UEAxMnVFdDQSBTZWN1cmUgU1NMIENlcnRpZmljYXRpb24gQXV0
aG9yaXR5MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAyS5amjYQhd10
hZs00r7RXdI3ASka2AQmJnOyA6bqvAYOMlMECUdlsjDccdmMdHx8YTYYMtmCy+UB
RJZ/ytVANVQlfcUvXzWfauFs8XpCC/Th+Ed2tIEEGK218QsBebImAHPGDvp2Yglj
XVaQR/0FeN1lIzQ3iUkad0dCsC/bxFiWsmsjeSscTaxrYzHFADUhK0qj4W5PmOuw
lAR3C4XXgzPAI3V0qBpQ7sqgNLaNBFTZkP6AVryZC+DapfWBIMmIxIOg8g25MKb4
XvXkCLYKIxi8Djhv1zSmLLrKbQFZrjWlD/OWqInPPmSwBrKZ13EMQhoRRi1pXfN+
J2ugR/PUQQIDAQABo4IBljCCAZIwHwYDVR0jBBgwFoAUSNvN3o7pSXJaiOix2D0H
s7lrZlAwHQYDVR0OBBYEFJLn+mIWcYzzl3FCxgan4EZhS1y2MA4GA1UdDwEB/wQE
AwIBhjAdBgNVHSUEFjAUBggrBgEFBQcDAQYIKwYBBQUHAwIwSgYDVR0gBEMwQTA1
BgsrBgEEAYK/JQEBFTAmMCQGCCsGAQUFBwIBFhhodHRwczovL3d3dy50d2NhLmNv
bS50dy8wCAYGZ4EMAQICMEkGA1UdHwRCMEAwPqA8oDqGOGh0dHA6Ly9yb290Y2Eu
dHdjYS5jb20udHcvVFdDQVJDQS9nbG9iYWxfcmV2b2tlXzQwOTYuY3JsMBIGA1Ud
EwEB/wQIMAYBAf8CAQAwdgYIKwYBBQUHAQEEajBoMDwGCCsGAQUFBzAChjBodHRw
Oi8vc3Nsc2VydmVyLnR3Y2EuY29tLnR3L2NhY2VydC9yb290NDA5Ni5jcnQwKAYI
KwYBBQUHMAGGHGh0dHA6Ly9yb290b2NzcC50d2NhLmNvbS50dy8wDQYJKoZIhvcN
AQELBQADggIBADVzQW2rRsMiWoVrBdZX1BiOgN6B/Ryt2zpq8uRxFQspvGYfUVIm
4uU4AaPR7aQ5KwpKjDWv2ncvX2ssCY54B82g2mxEEVEdu5PFl0jkuk4LmPsClYZc
6J6odUbVI3wtv2yF6+fqQrO+gDhEIhlg3IqWICfiyJZS+p2TirMszGzs4a+K9tZX
rS2W/jKsSt4bSmcIzDpwm2gSaSuLDIAwq0WrD29kA7+N+rMMs4zBIVKyYm9r08q4
UOGU16J7mKBrF0KYDZFyT9Hq5HAX2uwYoQJxQ5Z0BR8eZH8AIIi2vsFC8pkv2ra1
2dldd3Pivm0mdratbn1Z6MQ71FKR9Ui3L8P+0xu8DkhhxE11Ogpl+aquBUqGcvlD
0SgpXy+eoeFaRhFXRUkWtH/3XYo+h+N+4jZmgjCLd4+YI+u5tbUGpyBMABmUDiqZ
xcrPGc4cvXExqYePUg6cFCDcjqGCxqSu5BPbA5R+DSTkn5Sc1WQzORJpD5b7pcEq
8msolev88dcmddLXMyWzXQfPHA4vaQD74lr5LIzn6BRjVv+ZB7Y0ZTnnOimDXxn7
Cxqd+1/8ldRis/tO/JWZsMm5ruvCppwCZUdXjSNI5R1OxzVwTVLzsCoiSYPV0agd
a5dQ9wayB6OohBK7+ZU2V3sZwE2xwHdDzfhbdzmI++TxtOurDHbkfkED
-----END CERTIFICATE-----`;

// 2026-10-30 補：ws.dgbas.gov.tw 2026-10-07 換了新憑證，改由另一條鏈簽發：
//   葉憑證 -> TWCA SSL Certification Authority（下面這張）-> TWCA CYBER Root CA
// CYBER Root 已在 Node 內建信任清單裡（node 26 實測，指紋跟 TWCA 官網的 cyber_root_2022.crt 相同），
// 只缺中繼憑證。10/23 失業率抓取失敗（unable to verify the first certificate），CPI 10/10 的失敗很可能
// 也是同一個原因：那時伺服器只送葉憑證，這個 adapter 只有舊鏈的中繼憑證。10/30 實測伺服器有送完整鏈，
// 所以照常驗得過；補上這張是為了伺服器又只送葉憑證時也不會斷。
// 上面跟下面的舊鏈兩張是 10-07 以前的；確定主計總處不會再換回舊憑證後可以刪掉。
// 來源：http://sslserver.twca.com.tw/cacert/Cyber_SSL_2023.crt（葉憑證 AIA 指向的位址），sha256 指紋
// 01:AF:23:24…:E5:31，跟伺服器送的中繼憑證相同；用 openssl verify 實測過只靠葉憑證加上這張就能驗證通過。
export const TWCA_SSL_CA_PEM = `-----BEGIN CERTIFICATE-----
MIIG1DCCBLygAwIBAgIQQAE0sE8AAAAAAAAAA+MkrDANBgkqhkiG9w0BAQwFADBQ
MQswCQYDVQQGEwJUVzESMBAGA1UEChMJVEFJV0FOLUNBMRAwDgYDVQQLEwdSb290
IENBMRswGQYDVQQDExJUV0NBIENZQkVSIFJvb3QgQ0EwHhcNMjMwMjIzMDcyMjI0
WhcNMzMwMjIzMTU1OTU5WjBhMQswCQYDVQQGEwJUVzESMBAGA1UEChMJVEFJV0FO
LUNBMRMwEQYDVQQLEwpTU0wgU3ViLUNBMSkwJwYDVQQDEyBUV0NBIFNTTCBDZXJ0
aWZpY2F0aW9uIEF1dGhvcml0eTCCAiIwDQYJKoZIhvcNAQEBBQADggIPADCCAgoC
ggIBAMquxiSlMrxfOO29yqxCo/BIYBswnE7snZnuZDPcx8N9WhOdNGDsF024VjXK
nXoVaZBcv56eFsU+w9Mcq+uIVYzjVrBoe5u8ZLE0hPSkluH8URhcxtSQJ+gXcB0L
JHsseAeXVcgqoxTSJ6/n0xTCeXEnGwSRAzrqTvjS2gbd3TILxsfIHwRgwwPjBDgm
tjzbHHOFTJB3GCtH65T9A0viM2B/IW9Wz73jkz02AVMrZBHQ67IJ2W9CoIjd5mdG
eIV36U9NXl+wZa/D90pLRsFVbItKgLXgF71CQ92vS/biTx8fA6UUCU2ToNczP5Ur
A/mDXCBCLakwa1I3ylRkgFwluJw9DqiYh56MRgsEABa+ZPrm1Qb9njQZK4Y4V+ML
IvGM3xVoHIlvaSN29ubTueLpTeuAwN2VTiRzfOyCRKTcMBCtlMw1WCJNAMiNWDWS
BMnY9SlKv1oujmjS/ti0ptcipMymIoeWpVuQt3Mj8lYlKRpd6Zg8MbljMwQRSClK
6O6MSwpM3Xy5uJGh2cY5oYmKtxfyHSuKtKsk+daAPV1lpWYp9bNrbsLUPwmSY+zk
VgkZdiWBF//RP/72/esANONINy5hkWjkVd0NLjA5TAgk+DVVmnPtQIj1vBgtk8ak
Y9CczIbEgKBonkHWn+GX2ycR6jadg2P+xrBFg4MGjomkb2gtAgMBAAGjggGXMIIB
kzAfBgNVHSMEGDAWgBSdhWEUfMFib5do5E83QOGt4A1WNzAdBgNVHQ4EFgQU8ijU
+dQcfhprFoLl75Mpae3KFSAwDgYDVR0PAQH/BAQDAgEGMBMGA1UdJQQMMAoGCCsG
AQUFBwMBMEoGA1UdIARDMEEwNQYLKwYBBAGCvyUBARUwJjAkBggrBgEFBQcCARYY
aHR0cHM6Ly93d3cudHdjYS5jb20udHcvMAgGBmeBDAECAjBNBgNVHR8ERjBEMEKg
QKA+hjxodHRwOi8vUm9vdENBLnR3Y2EuY29tLnR3L1RXQ0FSQ0EvY3liZXJfcm9v
dF9yZXZva2VfMjAyMi5jcmwwEgYDVR0TAQH/BAgwBgEB/wIBADB9BggrBgEFBQcB
AQRxMG8wQwYIKwYBBQUHMAKGN2h0dHA6Ly9zc2xzZXJ2ZXIudHdjYS5jb20udHcv
Y2FjZXJ0L2N5YmVyX3Jvb3RfMjAyMi5jcnQwKAYIKwYBBQUHMAGGHGh0dHA6Ly9y
b290b2NzcC50d2NhLmNvbS50dy8wDQYJKoZIhvcNAQEMBQADggIBAIFF/6Gnvu8L
3xQDIampB8QVgoKS2bcjte0uJBbCrQHpzcGTuVTkZaiA86LwVz6SAU7TVgVYRXmt
x8l29WzfKI6wOAzmvlGZxSYAdN0I6YBkJK1nmDs0+TSw5lCzb+UOpajNOaMdJ5SN
YTN87yRwl82AFrwUmSLaMV4tN7W49N0SsELWs/d4uNHSMM0mBjd0hLDIWJFwOkuD
yOWahnCVfPlCwSVWpUntOGgOHOA02IUE+JNX+spIV1SwAMYaEVyHe316YUgiGA5y
k3liTa3vuv06eE1J2yiWrs9booW2VTHD+amzucFFNN1KvSLjSbYxG1t/FclHEN/y
6hGM3bkjRC31A0jzpv93D3MUQTdJascicPa0H4i8hviRriyetaC6HC4q8FQUTo2A
cEpxicNGgyHhDV+YdbnS6GZL+f3bsmMM8ZFYZ77mDTS9mRO1VnIwkjiN4vpzh67a
KTpoD9TQzZcGQiJy6Pi+PCSFiqjK7UD/63L/Pt0hpoNKvZLrz4ngrlpyzpx8KjeS
A5cjKcc6vlHm0Kk07k5djhJsaqQELso5r+UXi9qC+nwqPuR/w5kJZv4fz0ND4UhY
5y3qd+iCikkF3WzOzey7jUH9URKb3iZnRAHZvmyLK57UI0FwP+5xZEByvwXDtxbe
914Hj3cSUrmKT3g/ZlOQQ1THeu48MA79
-----END CERTIFICATE-----`;

// 來源：https://sslserver.twca.com.tw/cacert/root4096.crt（TWCA Global Root CA，Node 內建的
// Mozilla 信任清單裡沒有這張，要自己補）
const TWCA_ROOT_PEM = `-----BEGIN CERTIFICATE-----
MIIFWTCCBEGgAwIBAgIQQAEzU+QAAAAAAAAMyl0baTANBgkqhkiG9w0BAQsFADBf
MQswCQYDVQQGEwJUVzESMBAGA1UECgwJVEFJV0FOLUNBMRAwDgYDVQQLDAdSb290
IENBMSowKAYDVQQDDCFUV0NBIFJvb3QgQ2VydGlmaWNhdGlvbiBBdXRob3JpdHkw
HhcNMTQxMDI4MDczODMxWhcNMzAxMDI4MTU1OTU5WjBRMQswCQYDVQQGEwJUVzES
MBAGA1UEChMJVEFJV0FOLUNBMRAwDgYDVQQLEwdSb290IENBMRwwGgYDVQQDExNU
V0NBIEdsb2JhbCBSb290IENBMIICIjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKC
AgEAsAXbyOuMxG6KIe+OTZxxCh9ScO1tgpyXxddMTkVJy0BCtRI0bBnCdKQxX4UC
l+xDMwpT0pyMjre4edsr1WryjmbE7isBB5LUs9AC31D2Va9mDsvgR2AvKzI5NVI6
KIP4exbGGLhi1kclkc7wGRJNrWP10z91XynwoTAcKqCYphW97v0ZNvDikUOP+srW
ECdJTO/dwfGFcJvK6qhaQ/xthm9z6TdFqfA2x8yIdR67bAb/m2s+F+xhqnF8xh2i
90npFbU81qFh9RH3BW8d/RG+0DAHwimwCU4m3OOiqJFqH8KRRYhc5Zi4caUVGcl8
dRHMcHRPLZsdkUT9Viig/ruGasj6XAtY3MZLdsirItlzD6X0WgKJP0+eIoLuonRT
Kj1TJ2kdbI4yLGQAJmNhNk6jRrc/fbMtrG2QopWizs/agucHNBmW6bghqil+pji+
jilKIWZ5H7PDtQln3tbUB0bzKtrmIjdgy4G2D6AP6ciVf79VkQV6zz0VwG/eCZQB
g9c0G8xApfC4m2fVmJE7p4R4lSakWgj4K3S0AAQ837gUjujfqY1sZ5IzHcC30uyS
yL4JvywpBW8Ca57vvL8qvFvAUI9BcHGHsk23BKmEozKvru5rF4uysf5s4ZCMiKiX
SM7ITcvzBs9fagpCsR4edy+OoOaSDgb8BSLSJuExUX0y3A8CAwEAAaOCAR0wggEZ
MB8GA1UdIwQYMBaAFGo4WyaN3ota8k96VIMZGOMINaa6MB0GA1UdDgQWBBRI283e
julJclqI6LHYPQezuWtmUDAOBgNVHQ8BAf8EBAMCAQYwOAYDVR0gBDEwLzAtBgRV
HSAAMCUwIwYIKwYBBQUHAgEWF2h0dHA6Ly93d3cudHdjYS5jb20udHcvMEIGA1Ud
HwQ7MDkwN6A1oDOGMWh0dHA6Ly9Sb290Q0EudHdjYS5jb20udHcvVFdDQVJDQS9y
ZXZva2VfMjA0OC5jcmwwDwYDVR0TAQH/BAUwAwEB/zA4BggrBgEFBQcBAQQsMCow
KAYIKwYBBQUHMAGGHGh0dHA6Ly9yb290b2NzcC50d2NhLmNvbS50dy8wDQYJKoZI
hvcNAQELBQADggEBACkLbsSU3GJZk3paTF3cmT6OqPv5oI8b2SdwbfguXkhpYRdA
EImqA7gcy9+8bChUH8Uh9UuWv/xMR8oLd8PMZntvuTYIafnBke2P1p6iIuiCt4nI
qtAg50qsIysvT/ZPFGvxekWhh8hx56ekuYBryc7NiiWczdMJpTL6JNFRfzwxmUfq
H6dvboTNrtiuNWrWy+C+E8GiMcvuH+km37cGxg1FCuerRVcetwGbMfXyBUBFhtgC
G9BLIdsgguMi6U/jXSvEORIXKMa5Z7F94bJ8duU2hNp0Xqw4tmv47qEDxLDEXBJM
bwbaOkRltjaXDBh50EaXMx+rUqjO3le0KBM4t6w=
-----END CERTIFICATE-----`;

const BASE_CA = [...tls.rootCertificates, TWCA_INTERMEDIATE_PEM, TWCA_ROOT_PEM, TWCA_SSL_CA_PEM];
const learnedCa: string[] = []; // AIA 補回來的中繼憑證，只存在這個 instance 的記憶體裡
let dgbasHttpsAgent = new https.Agent({ ca: BASE_CA });

/**
 * 伺服器沒送中繼憑證時，照瀏覽器跟 Windows 的做法（AIA chasing）從憑證的 CA Issuers 網址把缺的
 * 中繼憑證抓回來（2026-10-30 使用者核准）。這樣主計總處下次換憑證，就不用等人手動把新的中繼憑證貼進上面。
 *
 * 抓回來的憑證會被加進 ca，而 **ca 裡的每一張都是信任錨點**，所以一定要先確認它一路接得上原本就
 * 信任的憑證：簽章、CA 旗標、有效期都要驗。不然中間人只要在假憑證的 AIA 放自己的 CA，就會被信任。
 * 回傳要加進 ca 的 PEM；接不上就回空陣列，讓呼叫端照原本的錯誤失敗。
 */
export const resolveMissingIntermediates = async (
  leaf: X509Certificate,
  downloadCert: (url: string) => Promise<X509Certificate>,
  trusted: X509Certificate[],
  now = new Date()
): Promise<string[]> => {
  const chain: X509Certificate[] = [];
  let child = leaf;
  for (let depth = 0; depth < 3; depth++) {
    const url = child.infoAccess?.match(/CA Issuers - URI:(https?:\/\/\S+)/)?.[1];
    if (!url) return [];
    const issuer = await downloadCert(url);
    const issuedChild = issuer.ca && child.checkIssued(issuer) && child.verify(issuer.publicKey);
    if (!issuedChild || now < issuer.validFromDate || now > issuer.validToDate) return [];
    chain.push(issuer);
    if (trusted.some((t) => issuer.checkIssued(t) && issuer.verify(t.publicKey))) return chain.map((c) => c.toString());
    child = issuer;
  }
  return [];
};

// 只為了讀伺服器送的葉憑證：握手完就關，不送任何請求，所以這裡關掉驗證不會讓未驗證的連線傳出資料。
const fetchPeerLeaf = (host: string): Promise<X509Certificate> =>
  new Promise((resolve, reject) => {
    const socket = tls.connect({ host, port: 443, servername: host, rejectUnauthorized: false }, () => {
      const cert = socket.getPeerX509Certificate();
      socket.end();
      if (cert) resolve(cert);
      else reject(new Error(`${host} 沒有送出憑證`));
    });
    socket.setTimeout(15_000, () => socket.destroy(new Error(`${host} TLS 連線逾時`)));
    socket.on('error', reject);
  });

// AIA 網址是從還沒驗證過的憑證讀出來的，限制大小跟時間；內容是 DER 或 PEM 都行。
const downloadCert = (url: string): Promise<X509Certificate> =>
  new Promise((resolve, reject) => {
    const client = url.startsWith('https:') ? https : http;
    const req = client.get(url, { headers: { 'User-Agent': OUTBOUND_USER_AGENT }, timeout: 15_000 }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`AIA 憑證下載失敗：HTTP ${res.statusCode}（url=${url}）`));
        return;
      }
      const chunks: Buffer[] = [];
      let size = 0;
      res.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > 65_536) req.destroy(new Error(`AIA 憑證超過 64KB（url=${url}）`));
        else chunks.push(chunk);
      });
      res.on('end', () => {
        try {
          resolve(new X509Certificate(Buffer.concat(chunks)));
        } catch (error) {
          reject(error);
        }
      });
    });
    req.on('timeout', () => req.destroy(new Error(`AIA 憑證下載逾時（url=${url}）`)));
    req.on('error', reject);
  });

export interface DgbasObs {
  item: string; // 統計項目名稱，例如 "總指數(指數基期：民國110年=100)"
  timePeriod: string; // 例如 "1981M01"（月）或 "1981Q1"（季）
  freq: string; // "M" | "Q"
  type: string; // 例如 "原始值"、"年增率(%)"
  value: string; // 原始字串，可能是空字串（缺值，通常是資料起始年份沒有前一年可比較，年增率算不出來）
}

// 已用真實回應核對過：CPI 檔案 88,614 個 <Obs>，這個 regex 全部解析成功、一個不漏（2026-09-02）。
const OBS_REGEX = /<Obs>\s*<Item>([^<]*)<\/Item>\s*<TIME_PERIOD>([^<]*)<\/TIME_PERIOD>\s*<FREQ>([^<]*)<\/FREQ>\s*<TYPE>([^<]*)<\/TYPE>\s*<Item_VALUE>([^<]*)<\/Item_VALUE>\s*<\/Obs>/g;

export const fetchDgbasXml = async (url: string): Promise<string> => {
  try {
    return await downloadXml(url);
  } catch (error) {
    // UNABLE_TO_VERIFY_LEAF_SIGNATURE 就是「unable to verify the first certificate」：伺服器沒送中繼憑證。
    // 其他憑證錯誤（過期、根憑證不受信任、網域不符）是真的安全問題，照常失敗。
    if ((error as NodeJS.ErrnoException).code !== 'UNABLE_TO_VERIFY_LEAF_SIGNATURE') throw error;
    let pems: string[];
    try {
      const trusted = [...BASE_CA, ...learnedCa].map((pem) => new X509Certificate(pem));
      pems = await resolveMissingIntermediates(await fetchPeerLeaf(new URL(url).hostname), downloadCert, trusted);
    } catch (aiaError) {
      throw new Error(`${(error as Error).message}；AIA 補中繼憑證也失敗：${(aiaError as Error).message}`, { cause: error });
    }
    if (pems.length === 0) throw error;
    learnedCa.push(...pems);
    dgbasHttpsAgent = new https.Agent({ ca: [...BASE_CA, ...learnedCa] });
    const subjects = pems.map((pem) => new X509Certificate(pem).subject.replace(/\n/g, ', ')).join(' / ');
    console.warn(JSON.stringify({ severity: 'WARNING', message: `${new URL(url).hostname} 沒送中繼憑證，已從 AIA 補上（${subjects}）。請把它貼進 dgbas/client.ts，免得每次冷啟動都要重抓。` }));
    return downloadXml(url);
  }
};

const downloadXml = (url: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    https
      .get(url, { agent: dgbasHttpsAgent, headers: { 'User-Agent': OUTBOUND_USER_AGENT } }, (res) => {
        const statusCode = res.statusCode ?? 0;
        if (statusCode < 200 || statusCode >= 300) {
          res.resume(); // 消耗掉 response body，避免 socket 卡住不釋放
          reject(new Error(`DGBAS XML 下載失敗：HTTP ${statusCode}（url=${url}）`));
          return;
        }

        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        res.on('error', reject);
      })
      .on('error', reject);
  });
};

export const parseDgbasObsXml = (xml: string): DgbasObs[] => {
  const results: DgbasObs[] = [];
  for (const match of xml.matchAll(OBS_REGEX)) {
    results.push({
      item: match[1] ?? '',
      timePeriod: match[2] ?? '',
      freq: match[3] ?? '',
      type: match[4] ?? '',
      value: match[5] ?? '',
    });
  }
  return results;
};
