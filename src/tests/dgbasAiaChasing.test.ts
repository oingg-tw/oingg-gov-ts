import { describe, it, expect } from 'vitest';
import tls from 'node:tls';
import { X509Certificate } from 'node:crypto';
import { resolveMissingIntermediates, TWCA_SSL_CA_PEM } from '@/adapters/dgbas/client';

// ws.dgbas.gov.tw 2026-10-07 換上的葉憑證（2026-10-30 從伺服器取得），AIA 指向
// http://sslserver.twca.com.tw/cacert/Cyber_SSL_2023.crt，也就是 TWCA_SSL_CA_PEM。
const DGBAS_LEAF = new X509Certificate(`-----BEGIN CERTIFICATE-----
MIIICDCCBfCgAwIBAgIQR+oAAAAJf+5BTjpAOXvOfDANBgkqhkiG9w0BAQsFADBh
MQswCQYDVQQGEwJUVzESMBAGA1UEChMJVEFJV0FOLUNBMRMwEQYDVQQLEwpTU0wg
U3ViLUNBMSkwJwYDVQQDEyBUV0NBIFNTTCBDZXJ0aWZpY2F0aW9uIEF1dGhvcml0
eTAeFw0yNjEwMDcwODU4MDFaFw0yNzA0MjMxNTU5NTlaMGcxCzAJBgNVBAYTAlRX
MQ8wDQYDVQQHDAboh7rngaMxLDAqBgNVBAoMI+aUv+W6nOapn+mXnC3ooYzmlL/p
maIt5Li76KiI57i96JmVMRkwFwYDVQQDExB3d3cuZGdiYXMuZ292LnR3MIIBIjAN
BgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAxIx/jMrW310oLS8K0jhygqW203Pc
28X3vgWv2yGMu/ZYbXkAMphHbpcDlkUFGVLCBMrry+zEA2F8+n2qcu0hjeGfsadD
1xAxriJXFm3oAJwNSoMuK8q0+qo39KgSnrzSKJEwewECVO8Q8KIRNGXZR0g/FrlI
4Fof3y9SRZOJdj8+rfCCQTlQ+/DMFsR7qaYQWuPzVTQRywutddy5akuEV/juHJJE
mVTgD7DJsHWI4ruHpRrigzDIwCUgMhqsmHao9a2UPiixzSQnWOBSyXQrZkY9dAX7
68z4Ddag/QtL9yYvJunLxZiHyTlMXaZu5z4/L87cRWWikCwe09L5Z7B4oQIDAQAB
o4IDtDCCA7AwHwYDVR0jBBgwFoAU8ijU+dQcfhprFoLl75Mpae3KFSAwHQYDVR0O
BBYEFE3Qr4b+uIhkIU1VmIM8YAFJtUFEMEoGA1UdHwRDMEEwP6A9oDuGOWh0dHA6
Ly9zc2xzZXJ2ZXIudHdjYS5jb20udHcvc3Nsc2VydmVyL0N5YmVyX1NTTF8yMDIz
LmNybDCBnQYDVR0RBIGVMIGSghB3d3cuZGdiYXMuZ292LnR3ghBlbmcuZGdiYXMu
Z292LnR3gg93d3cuc3RhdC5nb3YudHeCD2VuZy5zdGF0Lmdvdi50d4IPaWEuZGdi
YXMuZ292LnR3ghJlYm9vay5kZ2Jhcy5nb3YudHeCD3dzLmRnYmFzLmdvdi50d4IU
ZWJhc25ldy5kZ2Jhcy5nb3YudHcwfwYIKwYBBQUHAQEEczBxMEIGCCsGAQUFBzAC
hjZodHRwOi8vc3Nsc2VydmVyLnR3Y2EuY29tLnR3L2NhY2VydC9DeWJlcl9TU0xf
MjAyMy5jcnQwKwYIKwYBBQUHMAGGH2h0dHA6Ly90d2Nhc3Nsb2NzcC50d2NhLmNv
bS50dy8wSgYDVR0gBEMwQTA1BgsrBgEEAYK/JQEBFTAmMCQGCCsGAQUFBwIBFhho
dHRwczovL3d3dy50d2NhLmNvbS50dy8wCAYGZ4EMAQICMAwGA1UdEwEB/wQCMAAw
DgYDVR0PAQH/BAQDAgWgMBMGA1UdJQQMMAoGCCsGAQUFBwMBMIIBgAYKKwYBBAHW
eQIEAgSCAXAEggFsAWoAdgAcn2gs6frwRWlQ+BuWiofd2zIQ2EzmyLLjglJKxM9Z
nwAAAaEVlaDUAAAEAwBHMEUCIQCaGV18e4XiyqiuYI/8TABSia6FC91ZBwakQQbu
LDlcbQIgL9KE/+s61H0e6BYI9JEcFc9YT/lL4+A77y8iejkPDcsAdwBgTJqven93
XwHUBvySDciZ6wscffjJUhv6+hd3O5eLyQAAAaEVlaNMAAAEAwBIMEYCIQDm228E
/hgZtiYi/1DUxKx1sPyX42hxcJSVP3HWn8onSgIhALDdTpTk901t801DTyVdC3AQ
tISGzksZc6fRzP3mkXq8AHcATGPcmOWcHauI9h6KPd6uj6tEozd7X5uUw/uhnPzB
viYAAAGhFZWhnAAABAMASDBGAiEAqhzOdBUpKYCRRmB0sr7kRDRLDf0SWNB+KDFy
d+Ainr0CIQDJAZy6+f7ywXjL9ajBvXbp/zx5A4sOOW11VN/rnO7n/DANBgkqhkiG
9w0BAQsFAAOCAgEAeODj9XhPw71P2Lbaqn/MIl9AriEL2byvxHud4hyh5BsPWFST
fhPiCZ+0F3OGHSLbR7hDj35FUesPS74SuCPRL1XuB7CPh/niX16CnGkkulAFzQXP
Cy51mXJABtZVf8khoeU5jk1RZJ/2DR8qrq03upUwrHf3jQl5859DI9ppGTXru3OG
ZogaO3tf5Suc+1NLsYE7zN38CsEbvHInftJ2aXAsQD1VTAixj0dFaWZOBtDWUIT4
de66YNhenGabnN9m0FkBMWkcvjjO2nl/jxJzp0ju7rC/xKw7gqei0Cwe0uKOKzPE
D6wiNIPsYOzV2wDEGJkWbwcK2y91duX2Y/I/Lr95DRNA+dY6j2OUDfYAbBs9ZXPo
7rsiNixtjx2tJu8EU/RjkP9THo0xqTirZWhYvinKIKsvgbEQo0vi0iu1NHpqELLn
y81Tv00RUaRwYmSvYkMZcrDJ6jWPudb7qqVQ8pwYvqTgpmzxQtgxGKUVjBSMNoo0
gIXPLcDo1Ar66uAUogJJ7rt6/Tk9FXRMU80kwLvaXxfYwrLwZ68aM4+jVpkBWiBf
ZLARSS78R3sfZ6TKhPqUehuNFYRKDKeDt9E/31zUA9t9C7mMjLuc/a88qQ8Y9yo8
Xoo65emH8qlw6BiDcbVvNtIK0QPLOaVTdXOq9UUCNJt890cG3R1fYc7djbI=
-----END CERTIFICATE-----`);

const SSL_CA = new X509Certificate(TWCA_SSL_CA_PEM);
const CYBER_ROOT = tls.rootCertificates.map((pem) => new X509Certificate(pem)).find((c) => c.subject.includes('TWCA CYBER Root CA'))!;
const NOW = new Date('2026-10-30T00:00:00Z');

// 依網址回傳憑證，模擬 TWCA 的 AIA 下載點；沒列到的網址當作抓不到。
const downloader = (byUrl: Record<string, X509Certificate>) => async (url: string) => {
  const cert = byUrl[url];
  if (!cert) throw new Error(`unexpected AIA fetch: ${url}`);
  return cert;
};
const SSL_CA_URL = 'http://sslserver.twca.com.tw/cacert/Cyber_SSL_2023.crt';
const CYBER_ROOT_URL = 'http://sslserver.twca.com.tw/cacert/cyber_root_2022.crt';

describe('resolveMissingIntermediates', () => {
  it('returns the intermediate when it signs the leaf and chains to a trusted root', async () => {
    const pems = await resolveMissingIntermediates(DGBAS_LEAF, downloader({ [SSL_CA_URL]: SSL_CA }), [CYBER_ROOT], NOW);
    expect(pems).toEqual([SSL_CA.toString()]);
  });

  it('returns nothing when the chain does not reach a trusted root, so a forged CA is never trusted', async () => {
    const fetch = downloader({ [SSL_CA_URL]: SSL_CA, [CYBER_ROOT_URL]: CYBER_ROOT });
    expect(await resolveMissingIntermediates(DGBAS_LEAF, fetch, [], NOW)).toEqual([]);
  });

  it('returns nothing when the downloaded certificate did not sign the leaf', async () => {
    expect(await resolveMissingIntermediates(DGBAS_LEAF, downloader({ [SSL_CA_URL]: CYBER_ROOT }), [CYBER_ROOT], NOW)).toEqual([]);
  });

  it('returns nothing when the intermediate has expired', async () => {
    const after = new Date('2033-03-01T00:00:00Z'); // TWCA SSL CA 到期日是 2033-02-23
    expect(await resolveMissingIntermediates(DGBAS_LEAF, downloader({ [SSL_CA_URL]: SSL_CA }), [CYBER_ROOT], after)).toEqual([]);
  });
});
