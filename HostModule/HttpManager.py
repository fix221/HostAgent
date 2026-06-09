import os
import time
import signal
import random
import traceback
import subprocess
from pathlib import Path
from loguru import logger
from HostModule.DataManager import DataManager

# Caddy配置文件目录
CADDY_CONFIG_DIR = Path("DataSaving/webs")
# SSL证书文件目录
SSL_CERT_DIR = Path("DataSaving/cert")


class HttpManager:
    # 初始化 #####################################################################################
    def __init__(self,
                 config_name="HttpManage.txt",
                 proxys_type="tty",
                 proxys_addr="127.0.0.1"):
        # 初始化二进制进程和配置文件 =======================
        self.proxys_port = 0
        self.proxys_addr = proxys_addr
        self.proxys_type = proxys_type
        self.binary_proc = None
        self.binary_path = "HostConfig/Server_x64"
        self.config_path = Path("HostConfig")
        self.config_file = CADDY_CONFIG_DIR / config_name
        self.manage_port = random.randint(8000, 9000)
        # proxys_sshd格式: { ===============================
        #   port: {
        #       token:(ip,port)
        #   }
        # } ================================================
        self.proxys_sshd = {}
        # proxys_pve格式: { ================================
        #   token: {
        #       "ip": str, "port": int,
        #       "pve_ticket": str
        #   }
        # } ================================================
        self.proxys_pve = {}
        # proxys_list格式: { ===============================
        # domain: {
        #   "target": (port, ip),
        #   "is_https": bool,
        #   "listen_port": int
        #   }
        # } ================================================
        self.proxys_list = {}
        # 设置二进制路径 ===================================
        if os.name == 'nt':
            self.binary_path += ".exe"
            self.binary_path = self.binary_path.replace(
                "/", "\\")
        # SSL证书路径（根据配置名提取主机名）=============
        # config_name格式: vnc-{hostname}.txt 或 HttpManage.txt
        stem = Path(config_name).stem  # 如 vnc-x99pve 或 HttpManage
        if stem.startswith("vnc-"):
            cert_name = stem[4:]  # 提取主机名，如 x99pve
        else:
            cert_name = stem
        self.ssl_cert = SSL_CERT_DIR / f"web-{cert_name}.crt"
        self.ssl_key = SSL_CERT_DIR / f"web-{cert_name}.key"
        # 初始数据库管理 ===================================
        self.config_path.mkdir(exist_ok=True)
        CADDY_CONFIG_DIR.mkdir(parents=True, exist_ok=True)
        SSL_CERT_DIR.mkdir(parents=True, exist_ok=True)
        self.db_manager = DataManager()
        # 生成初始的配置 ===================================
        self.config_all()
        logger.info(f"[HttpManager] 初始化完成，"
              f"管理端口: {self.manage_port}，"
              f"配置文件: {self.config_file}")

    # 生成SSL自签名证书 ########################################################################
    @staticmethod
    def generate_ssl_cert(hostname="default"):
        """自动生成自签名SSL证书（如果不存在）"""
        cert_file = SSL_CERT_DIR / f"web-{hostname}.crt"
        key_file = SSL_CERT_DIR / f"web-{hostname}.key"
        if cert_file.exists() and key_file.exists():
            return True
        try:
            SSL_CERT_DIR.mkdir(parents=True, exist_ok=True)
            # 使用Python cryptography库生成自签名证书
            from cryptography import x509
            from cryptography.x509.oid import NameOID
            from cryptography.hazmat.primitives import hashes, serialization
            from cryptography.hazmat.primitives.asymmetric import rsa
            import datetime as dt
            import ipaddress

            # 生成RSA私钥
            key = rsa.generate_private_key(public_exponent=65537, key_size=2048)

            # 构建证书
            subject = issuer = x509.Name([
                x509.NameAttribute(NameOID.COMMON_NAME, "127.0.0.1"),
            ])
            cert = (
                x509.CertificateBuilder()
                .subject_name(subject)
                .issuer_name(issuer)
                .public_key(key.public_key())
                .serial_number(x509.random_serial_number())
                .not_valid_before(dt.datetime.now(dt.timezone.utc))
                .not_valid_after(dt.datetime.now(dt.timezone.utc) + dt.timedelta(days=3650))
                .add_extension(
                    x509.SubjectAlternativeName([
                        x509.IPAddress(ipaddress.IPv4Address("127.0.0.1")),
                        x509.DNSName("localhost"),
                    ]),
                    critical=False,
                )
                .add_extension(
                    x509.BasicConstraints(ca=True, path_length=None),
                    critical=True,
                )
                .sign(key, hashes.SHA256())
            )

            # 写入证书文件
            cert_file.write_bytes(
                cert.public_bytes(serialization.Encoding.PEM))
            # 写入私钥文件
            key_file.write_bytes(
                key.private_bytes(
                    serialization.Encoding.PEM,
                    serialization.PrivateFormat.TraditionalOpenSSL,
                    serialization.NoEncryption()))

            logger.info(f"[HttpManager] SSL证书已生成: {cert_file}")
            return True
        except ImportError:
            # 如果没有cryptography库，尝试用openssl命令
            try:
                cmd = [
                    "openssl", "req", "-x509", "-newkey", "rsa:2048",
                    "-keyout", str(key_file),
                    "-out", str(cert_file),
                    "-days", "3650", "-nodes",
                    "-subj", "/CN=127.0.0.1",
                    "-addext", "subjectAltName=IP:127.0.0.1,DNS:localhost"
                ]
                subprocess.run(cmd, capture_output=True, check=True)
                logger.info(f"[HttpManager] SSL证书已通过openssl生成: {cert_file}")
                return True
            except Exception as e:
                logger.error(f"[HttpManager] 生成SSL证书失败: {e}")
                return False
        except Exception as e:
            logger.error(f"[HttpManager] 生成SSL证书失败: {e}")
            return False

    # 生成完整的Caddy配置文件 ####################################################################
    def config_all(self):
        # 使用实例的管理端口生成全局配置
        # 有PVE代理时需要禁用HTTP重定向，避免Caddy尝试监听80端口
        if self.proxys_pve:
            config = f"{{\n\tadmin localhost:{self.manage_port}\n\tauto_https disable_redirects\n}}\n\n"
        else:
            config = f"{{\n\tadmin localhost:{self.manage_port}\n}}\n\n"
        # 生成普通代理配置 #######################################################################
        for domain, proxy_info in self.proxys_list.items():
            port, ip = proxy_info["target"]
            is_https = proxy_info.get("is_https", True)
            listen_port = proxy_info.get("listen_port")
            should_add_port = listen_port not in (None, 0, 80, 443)
            if domain.startswith("/") or domain == "":
                url = f"*:{listen_port}"
            elif should_add_port:
                protocol = "https" if is_https else "http"
                url = f"{protocol}://{domain}:{listen_port}"
            else:
                url = domain if is_https else f"http://{domain}"
            # 后端目标协议
            backend_protocol = "https" if is_https else "http"
            if domain.find("/") > -1:  # 存在子路径
                sub_path = "/" + "/".join(domain.split("/")[1:])
                config += (
                    f"{url} "
                    f"{{\n\t@secret path {sub_path}\n"
                    f"\treverse_proxy "
                    f"{backend_protocol}://{ip}:{port}\n"
                    f"}}\n\n")
            else:
                tls_skip = "\n\t\ttransport http {\n\t\t\ttls_insecure_skip_verify\n\t\t}" if is_https else ""
                config += (
                    f"{url} "
                    f"{{\n\treverse_proxy "
                    f"{backend_protocol}://{ip}:{port} {{{tls_skip}\n\t}}\n"
                    f"}}\n\n")
        # 生成SSH代理配置 ########################################################################
        if self.proxys_sshd:
            for listen_port, token_dict in self.proxys_sshd.items():
                # PVE代理需要HTTPS（PVE noVNC要求wss://）
                if self.proxys_pve:
                    config += "https://:%s {\n" % listen_port
                    # 使用预生成的自签名证书
                    cert_path = str(self.ssl_cert).replace("\\", "/")
                    key_path = str(self.ssl_key).replace("\\", "/")
                    config += f"\ttls {cert_path} {key_path}\n"
                else:
                    config += ":%s {\n" % listen_port
                if self.proxys_type == "vmk":
                    # 静态文件代理
                    config += f"\thandle_path /static/* {{\n"
                    config += f"\t\troot * VNCConsole/vSphere\n"
                    config += f"\t\tfile_server\n"
                    config += f"\t}}\n"
                    config += f"\t@websockets {{\n"
                    config += f"\theader Connection *Upgrade*\n"
                    config += f"\theader Upgrade websocket\n"
                    config += f"\t}}\n"
                for token, (target_ip, target_port) in token_dict.items():
                    # TTY代理 ====================================================================
                    if self.proxys_type == "tty":
                        config += f"\thandle_path /{token}* {{\n"
                        config += f"\t\treverse_proxy http://{target_ip}:{target_port} {{\n"
                        config += f"\t\t\theader_up Host {{http.request.host}}\n"
                        config += f"\t\t\theader_up X-Real-IP {{http.request.remote.host}}\n"
                        config += f"\t\t\theader_up X-Forwarded-For {{http.request.remote.host}}\n"
                        config += f"\t\t\theader_up REMOTE-HOST {{http.request.remote.host}}\n"
                        config += f"\t\t\theader_up Connection {{http.request.header.Connection}}\n"
                        config += f"\t\t\theader_up Upgrade {{http.request.header.Upgrade}}\n"
                        config += f"\t\t}}\n"
                        config += f"\t}}\n"
                    # VMK代理 ====================================================================
                    elif self.proxys_type == "vmk":
                        # 生成 ticket_path =================================
                        ticket_path = str(target_port)
                        if "/" in str(target_port):
                            ticket_path = str(target_port).split("/")[1]
                            target_port = str(target_port).split("/")[0]
                        # WebSocket 反向代理
                        config += f"\thandle_path /{token}/ws/* {{\n"
                        config += f"\t\treverse_proxy https://{target_ip}:{target_port} {{\n"
                        config += f"\t\t\theader_up Host {{http.axio.host}}\n"
                        config += f"\t\t\theader_up X-Real-IP {{http.axio.remote.host}}\n"
                        config += f"\t\t\theader_up X-Forwarded-For {{http.axio.remote.host}}\n"
                        config += f"\t\t\theader_up REMOTE-HOST {{http.axio.remote.host}}\n"
                        config += f"\t\t\theader_up Connection {{http.axio.header.Connection}}\n"
                        config += f"\t\t\theader_up Upgrade {{http.axio.header.Upgrade}}\n"
                        # config += f"\t\t\theader_up X-Target-Path /ticket/{ticket_path}\n"
                        config += f"\t\t\ttransport http {{\n"
                        config += f"\t\t\t\ttls_insecure_skip_verify\n"
                        config += f"\t\t\t}}\n"
                        config += f"\t\t}}\n"
                        config += f"\t}}\n"
                        # 返回 test.html 模板
                        html_template = f'''<!DOCTYPE html PUBLIC"-//W3C//DTD XHTML 1.0 Strict//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-strict.dtd">
                        <html xmlns="http://www.w3.org/1999/xhtml">
                        <head>
                        <meta http-equiv="content-type" content="text/html; charset=utf-8" />
                        <title>Console</title>
                        </head>
                        <body>
                        <link rel="stylesheet" type="text/css" href="/static/css/wmks-all.css" />
        <script type="text/javascript" src="/static/js/jquery-1.8.3.min.js"></script>
                        <script type="text/javascript" src="/static/js/jquery-ui-1.8.16.min.js"></script>
                        <script type="text/javascript" src="/static/wmks.min.js"></script>
                        <div id="wmksContainer" style="position:absolute;width:100%;height:100%"></div>
                        <script>
                        var wmks = WMKS.createWMKS("wmksContainer",{{}})
                         .register(WMKS.CONST.Events.CONNECTION_STATE_CHANGE, function(event,data){{
                         if(data.state == WMKS.CONST.ConnectionState.CONNECTED){{
                          console.log("connection state change : connected");}}}});
                        wmks.connect("ws://{self.proxys_addr}:{self.proxys_port}/{token}/ws/ticket/{ticket_path}");
                        </script>
                        </body>
                        </html>'''
                        config += f"\thandle_path /{token} {{\n"
                        config += f"\t\theader Content-Type text/html;charset=utf-8\n"
                        config += f"\t\trespond `{html_template}` 200\n"
                        config += f"\t}}\n"

                # 生成PVE代理配置（合并到同一端口块）========================================
                if self.proxys_pve:
                    # 收集所有PVE后端信息（用于兜底代理）
                    # 注意：PVE页面中的JS/CSS/API使用绝对路径（如/api2/...），
                    # 不会带token前缀，所以需要兜底handle代理所有请求到PVE
                    first_pve = list(self.proxys_pve.values())[0]
                    for pve_token, pve_info in self.proxys_pve.items():
                        ip = pve_info["ip"]
                        port = pve_info["port"]
                        pve_ticket = pve_info["pve_ticket"]
                        # /{token}/* -> strip prefix -> 代理到 PVE 根路径（入口）
                        config += f"\thandle_path /{pve_token}/* {{\n"
                        config += f"\t\treverse_proxy https://{ip}:{port} {{\n"
                        config += f"\t\t\theader_up Host {ip}:{port}\n"
                        config += f"\t\t\theader_up Cookie \"PVEAuthCookie={pve_ticket}\"\n"
                        config += f"\t\t\theader_up Connection {{http.request.header.Connection}}\n"
                        config += f"\t\t\theader_up Upgrade {{http.request.header.Upgrade}}\n"
                        config += f"\t\t\ttransport http {{\n"
                        config += f"\t\t\t\ttls_insecure_skip_verify\n"
                        config += f"\t\t\t}}\n"
                        config += f"\t\t}}\n"
                        config += f"\t}}\n"
                    # 兜底：代理所有其他请求（PVE页面内的绝对路径资源/API/WebSocket）
                    ip = first_pve["ip"]
                    port = first_pve["port"]
                    pve_ticket = first_pve["pve_ticket"]
                    config += f"\thandle {{\n"
                    config += f"\t\treverse_proxy https://{ip}:{port} {{\n"
                    config += f"\t\t\theader_up Host {ip}:{port}\n"
                    config += f"\t\t\theader_up Cookie \"PVEAuthCookie={pve_ticket}\"\n"
                    config += f"\t\t\theader_up Connection {{http.request.header.Connection}}\n"
                    config += f"\t\t\theader_up Upgrade {{http.request.header.Upgrade}}\n"
                    config += f"\t\t\ttransport http {{\n"
                    config += f"\t\t\t\ttls_insecure_skip_verify\n"
                    config += f"\t\t\t}}\n"
                    config += f"\t\t}}\n"
                    config += f"\t}}\n"
                config += "}\n\n"
        # 保存配置文件 ###########################################################################
        self.config_file.write_text(config)
        return True

    # 初始化VNC代理管理 ##########################################################################
    def launch_vnc(self,
                   port: int = random.randint(8000, 9000)):
        self.proxys_port = port
        if str(self.proxys_port) not in self.proxys_sshd:
            self.proxys_sshd[str(self.proxys_port)] = {}

    # 关闭SSH代理的管理 ##########################################################################
    def closed_vnc(self, port: int):
        if str(port) in self.proxys_sshd:
            del self.proxys_sshd[str(port)]

    # 添加PVE VNC代理 ##########################################################################
    def create_pve(self, token, ip, port, pve_ticket, **kwargs):
        """添加PVE noVNC代理配置（通过Caddy代理整个PVE Web界面）"""
        try:
            if token in self.proxys_pve:
                logger.warning(f"[HttpManager] PVE代理 {token} 已存在")
                return False
            if self.proxys_port == 0:
                self.launch_vnc()
            self.proxys_pve[token] = {
                "ip": ip, "port": port,
                "pve_ticket": pve_ticket
            }
            logger.info(f"[HttpManager] PVE代理已添加: /{token} -> {ip}:{port}")
            self.config_all()
            return self.reload_web()
        except Exception as e:
            logger.error(f"[HttpManager] 添加PVE代理失败: {str(e)}")
            return False

    def refresh_pve_tickets(self, pve_host, username, password):
        """刷新所有PVE代理的ticket（PVE ticket默认2小时过期）"""
        if not self.proxys_pve:
            return False
        try:
            import requests, urllib3
            urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
            # 重新获取PVE认证ticket
            auth_resp = requests.post(
                f"https://{pve_host}:8006/api2/json/access/ticket",
                data={"username": username, "password": password},
                verify=False, timeout=10
            )
            if auth_resp.status_code != 200:
                logger.warning(f"[HttpManager] 刷新PVE ticket失败: HTTP {auth_resp.status_code}")
                return False
            new_ticket = auth_resp.json().get('data', {}).get('ticket', '')
            if not new_ticket:
                logger.warning("[HttpManager] 刷新PVE ticket失败: 返回ticket为空")
                return False
            # 更新所有PVE代理的ticket
            for token in self.proxys_pve:
                self.proxys_pve[token]["pve_ticket"] = new_ticket
            # 重新生成配置并重载
            self.config_all()
            if self.reload_web():
                logger.info("[HttpManager] PVE ticket已刷新并重载Caddy配置")
                return True
            else:
                logger.warning("[HttpManager] PVE ticket已刷新但重载Caddy失败")
                return False
        except Exception as e:
            logger.error(f"[HttpManager] 刷新PVE ticket异常: {str(e)}")
            return False

    # 添加SSH的代理配置 ##########################################################################
    def create_vnc(self, token, target_ip, target_port, path=""):
        try:
            # 检查是否已有相同token的配置 ======================
            for port, token_dict in self.proxys_sshd.items():
                if token in token_dict:
                    logger.warning(f"[HttpManager] 令牌 {token} 的SSH代理配置已存在")
                    return False
            # 如SSH未启动则启动 ================================
            if self.proxys_port == 0:
                self.launch_vnc()
            # 添加到SSH代理配置 ================================
            proxy_conf = [target_ip, str(target_port)]
            if path != "":
                proxy_conf[1] += "/" + path
            proxy_port = str(self.proxys_port)
            self.proxys_sshd[proxy_port][token] = proxy_conf
            logger.info(f"[HttpManager] SSH代理已添加: "
                  f"/{token} -> {target_ip}:{target_port}"
                  f" (统一端口: {str(self.proxys_port)})")
            # 重新生成配置文件 =================================
            self.config_all()
            # 重载Caddy配置 ====================================
            return self.reload_web()

        except Exception as e:
            logger.error(f"[HttpManager] 添加SSH代理配置时发生错误: {str(e)}")
            logger.debug(traceback.format_exc())
            return False

    # 添加代理配置 ###############################################################################
    def create_web(self, target, domain, is_https=True, listen_port=None, persistent=True):
        """添加代理配置"""
        try:
            # 检查域名是否已存在
            if domain in self.proxys_list:
                logger.warning(f"[HttpManager] 域名 {domain} 的配置已存在")
                return True

            # 添加到内存配置
            self.proxys_list[domain] = {
                "target": target,
                "is_https": is_https,
                "listen_port": listen_port
            }

            # 重新生成配置文件
            self.config_all()

            # 重载Caddy配置
            return self.reload_web()

        except Exception as e:
            logger.error(f"[HttpManager] 添加代理配置时发生错误: {str(e)}")
            # 回滚
            if domain in self.proxys_list:
                del self.proxys_list[domain]
            return False

    # 删除代理配置 ###############################################################################
    def remove_web(self, domain):
        """删除代理配置"""
        try:
            # 检查域名是否存在
            if domain not in self.proxys_list:
                logger.warning(f"[HttpManager] 未找到匹配的代理配置: {domain}")
                logger.debug(f"[HttpManager] 当前已有的域名: {list(self.proxys_list.keys())}")
                return False

            # 备份配置（用于回滚）
            backup = self.proxys_list[domain]

            # 从内存配置中删除
            del self.proxys_list[domain]

            # 重新生成配置文件
            self.config_all()

            # 重载Caddy配置
            result = self.reload_web()

            if not result:
                # 回滚
                self.proxys_list[domain] = backup
                self.config_all()

            return result

        except Exception as e:
            logger.error(f"[HttpManager] 删除代理配置时发生错误: {str(e)}")
            return False

    # 启动Caddy服务 ##############################################################################
    def _get_caddy_env(self):
        """获取Caddy进程所需的环境变量（确保HOME已定义）"""
        env = os.environ.copy()
        if 'HOME' not in env:
            env['HOME'] = os.getcwd()
        if 'XDG_CONFIG_HOME' not in env:
            env['XDG_CONFIG_HOME'] = os.path.join(os.getcwd(), '.config')
        return env

    def launch_web(self):
        """启动Caddy服务"""
        try:
            cmd = [self.binary_path, "run", "--config", str(self.config_file), "--adapter", "caddyfile"]

            logger.info(f"[HttpManager] 启动Caddy命令: {' '.join(cmd)}")

            # 将Caddy的stdout/stderr重定向到独立日志文件
            caddy_log_dir = Path("DataSaving/logs")
            caddy_log_dir.mkdir(parents=True, exist_ok=True)
            caddy_log_path = caddy_log_dir / "log-weball.log"
            self._caddy_log_file = open(caddy_log_path, "a", encoding="utf-8")
            # Windows上不使用shell=True，避免cmd.exe解析导致参数丢失
            self.binary_proc = subprocess.Popen(
                cmd,
                stdout=self._caddy_log_file,
                stderr=self._caddy_log_file,
                env=self._get_caddy_env()
            )
            time.sleep(3)  # 等待进程启动

            if self.binary_proc.poll() is None:
                logger.info(f"[HttpManager] Caddy进程已启动，PID: {self.binary_proc.pid}")
                logger.info(f"[HttpManager] Caddy日志输出到: {caddy_log_path}")
                return True

            # 进程已退出，读取日志获取错误信息
            exit_code = self.binary_proc.returncode
            self._caddy_log_file.flush()
            self._caddy_log_file.close()
            self._caddy_log_file = None
            try:
                with open(caddy_log_path, "r", encoding="utf-8") as f:
                    # 读取最后20行日志
                    lines = f.readlines()
                    last_lines = ''.join(lines[-20:]) if len(lines) > 20 else ''.join(lines)
                    logger.error(f"[HttpManager] Caddy启动失败(退出码:{exit_code})，日志:\n{last_lines}")
            except Exception:
                logger.error(f"[HttpManager] Caddy启动失败(退出码:{exit_code})，无法读取日志")
            return False

        except FileNotFoundError:
            logger.error("[HttpManager] 错误: 找不到caddy可执行文件")
            return False
        except Exception as e:
            logger.error(f"[HttpManager] 启动Caddy时发生错误: {str(e)}")
            return False

    # 停止Caddy服务 ##############################################################################
    def closed_web(self):
        """停止Caddy服务"""
        try:
            # 先尝试通过 binary_proc 停止
            if self.binary_proc and self.binary_proc.poll() is None:
                self.binary_proc.terminate()
                try:
                    self.binary_proc.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    self.binary_proc.kill()
                    self.binary_proc.wait()
                self.binary_proc = None
                logger.info("[HttpManager] Caddy进程已停止")
            # 关闭Caddy日志文件句柄
            if hasattr(self, '_caddy_log_file') and self._caddy_log_file:
                self._caddy_log_file.close()
                self._caddy_log_file = None
            # 再按进程名强制杀掉所有残留的 Caddy 进程（防止 binary_proc 引用丢失）
            binary_name = os.path.basename(self.binary_path)
            if os.name == 'nt':
                result = subprocess.run(
                    ["taskkill", "/F", "/IM", binary_name],
                    capture_output=True, text=True
                )
                if result.returncode == 0:
                    logger.info(f"[HttpManager] 已强制终止残留Caddy进程: {binary_name}")
            else:
                subprocess.run(["pkill", "-f", binary_name],
                               capture_output=True)
            time.sleep(1)
            return True
        except Exception as e:
            logger.error(f"[HttpManager] 停止Caddy时发生错误: {str(e)}")
            return False

    # Caddy运行状态检查 ##########################################################################
    def is_web_running(self):
        return self.binary_proc is not None and self.binary_proc.poll() is None

    # 重载Caddy配置 ##############################################################################
    def reload_web(self):
        """重载Caddy配置"""
        try:
            # 尝试重载配置（无论binary_proc状态如何）
            if os.name == 'nt':
                # Windows: 先检查Caddy进程是否存活
                if not self.binary_proc or self.binary_proc.poll() is not None:
                    logger.warning("[HttpManager] Caddy进程未运行，尝试重新启动")
                    return self.launch_web()
                # 使用实例的管理端口进行重载
                reload_cmd = [self.binary_path, "reload", "--config",
                              str(self.config_file), "--adapter", "caddyfile",
                              "--address", f"localhost:{self.manage_port}"]
                logger.debug(f"[HttpManager] 重载服务命令: {' '.join(reload_cmd)}")
                result = subprocess.run(reload_cmd, capture_output=True, text=True,
                                        env=self._get_caddy_env())
                if result.returncode == 0:
                    logger.info(f"[HttpManager] Caddy配置已重载（管理端口: {self.manage_port}）")
                    return True
                else:
                    logger.warning(f"[HttpManager] Caddy重载失败: {result.stderr}")
                    # 重载失败时尝试重启Caddy
                    logger.info("[HttpManager] 尝试重启Caddy服务")
                    self.closed_web()
                    return self.launch_web()
            else:
                # Linux/Mac: 先检查Caddy进程是否存活
                if not self.binary_proc or self.binary_proc.poll() is not None:
                    logger.warning("[HttpManager] Caddy进程未运行，尝试重新启动")
                    return self.launch_web()
                # 使用caddy reload命令重载配置
                reload_cmd = [self.binary_path, "reload", "--config",
                              str(self.config_file), "--adapter", "caddyfile",
                              "--address", f"localhost:{self.manage_port}"]
                logger.debug(f"[HttpManager] 重载服务命令: {' '.join(reload_cmd)}")
                result = subprocess.run(reload_cmd, capture_output=True, text=True,
                                        env=self._get_caddy_env())
                if result.returncode == 0:
                    logger.info(f"[HttpManager] Caddy配置已重载（管理端口: {self.manage_port}）")
                    return True
                else:
                    logger.warning(f"[HttpManager] Caddy重载失败: {result.stderr}")
                    # 重载失败时尝试重启Caddy
                    logger.info("[HttpManager] 尝试重启Caddy服务")
                    self.closed_web()
                    return self.launch_web()
        except Exception as e:
            logger.error(f"[HttpManager] 重载Caddy配置时发生错误: {str(e)}")
            return False

# 使用示例
if __name__ == "__main__":
    manager = HttpManager()

    try:
        # 启动服务
        manager.launch_web()
        time.sleep(2)

        # 添加代理（使用HTTP协议，监听8081端口避免80端口冲突）
        manager.create_web((1880, "127.0.0.1"), "local.524228.xyz", is_https=False, listen_port=1889)

        # 等待一段时间
        time.sleep(100)

        # 删除代理
        manager.remove_web("local.524228.xyz")

        # 停止服务
        manager.closed_web()
    except KeyboardInterrupt as e:
        manager.closed_web()
