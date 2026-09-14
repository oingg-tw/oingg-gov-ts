import https from 'node:https';
import tls from 'node:tls';
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

const dgbasHttpsAgent = new https.Agent({ ca: [...tls.rootCertificates, TWCA_INTERMEDIATE_PEM, TWCA_ROOT_PEM] });

export interface DgbasObs {
  item: string; // 統計項目名稱，例如 "總指數(指數基期：民國110年=100)"
  timePeriod: string; // 例如 "1981M01"（月）或 "1981Q1"（季）
  freq: string; // "M" | "Q"
  type: string; // 例如 "原始值"、"年增率(%)"
  value: string; // 原始字串，可能是空字串（缺值，通常是資料起始年份沒有前一年可比較，年增率算不出來）
}

// 已用真實回應核對過：CPI 檔案 88,614 個 <Obs>，這個 regex 全部解析成功、一個不漏（2026-09-02）。
const OBS_REGEX = /<Obs>\s*<Item>([^<]*)<\/Item>\s*<TIME_PERIOD>([^<]*)<\/TIME_PERIOD>\s*<FREQ>([^<]*)<\/FREQ>\s*<TYPE>([^<]*)<\/TYPE>\s*<Item_VALUE>([^<]*)<\/Item_VALUE>\s*<\/Obs>/g;

export const fetchDgbasXml = (url: string): Promise<string> => {
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
