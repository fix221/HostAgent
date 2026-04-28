import json

from MainObject.Config.VMConfig import VMConfig
from MainObject.Config.OSConfig import OSConfig

DNS_SERVER_LIST = ["119.29.29.29", "223.5.5.5"]


class HSConfig:
    def __init__(self, config=None, /, **kwargs):
        # 基本信息 =============================
        self.server_name: str = ""  # 服务器名称
        self.server_type: str = ""  # 服务器类型
        self.server_addr: str = ""  # 服务器地址
        self.server_user: str = ""  # 服务器用户
        self.server_pass: str = ""  # 服务器密码
        self.server_port: int = 22  # 服务器端口
        self.server_area: str = ""  # 服务器区域
        self.filter_name: str = ""  # 过滤器名称
        self.extend_data: dict = {}  # API可选项
        self.enable_host: bool = False  # 已启用
        # 售价配置 =============================
        self.n_cpu_price = 0  # 处理器核心单价格
        self.n_mem_price = 0  # 虚拟机内存单价格
        self.n_hdd_price = 0  # 虚拟机硬盘单价格
        self.n_net_price = 0  # 虚拟机双向带价格
        # 存储信息 =============================
        self.images_path: str = ""  # 系统存储池
        self.dvdrom_path: str = ""  # 光盘存储池
        self.system_path: str = ""  # 系统存储池
        self.backup_path: str = ""  # 备份存储池
        self.extern_path: str = ""  # 数据存储池
        self.launch_path: str = ""  # 二进制路径
        # 本机网络 =============================
        self.network_nat: str = ""  # NAT网络NIC
        self.network_pub: str = ""  # PUB网络NIC
        self.ports_start: int = 0  # TCP端口起始
        self.ports_close: int = 0  # TCP端口结束
        self.remote_port: int = 0  # VNC服务端口
        self.limits_nums: int = 0  # VMS虚拟数量
        self.public_addr: list = []  # 公共IPV46
        # 系统映射 =============================
        # 系统镜像列表: 每项为 OSConfig (sys_name/sys_file/sys_size/sys_type)
        self.system_maps: list[OSConfig] = []
        # 光盘镜像列表: 每项为 OSConfig (sys_name/sys_file/sys_size/sys_type)
        self.images_maps: list[OSConfig] = []
        # 区域网络 =============================
        self.i_kuai_addr: str = ""  # 爱快OS地址
        self.i_kuai_user: str = ""  # 爱快OS用户
        self.i_kuai_pass: str = ""  # 爱快OS密码
        self.ipaddr_ddns: list = DNS_SERVER_LIST
        self.ipaddr_maps: dict[str, dict] = {}
        # 套餐划分 =============================
        self.server_plan: dict[str, VMConfig] = {}
        # 单价配置 =============================
        # 由小黑云财务/计费侧读取，用于按规格计算套餐单价
        self.n_cpu_price: int = 0  # 处理器核心单价格
        self.n_mem_price: int = 0  # 虚拟机内存单价格
        self.n_hdd_price: int = 0  # 虚拟机硬盘单价格
        self.n_net_price: int = 0  # 虚拟机双向带价格
        # 加载传入的参数 =======================
        if config is not None:
            self.__read__(config)
        self.__load__(**kwargs)

    # 加载数据 =================================
    def __load__(self, **kwargs):
        for key, value in kwargs.items():
            if hasattr(self, key):
                setattr(self, key, value)
        # 将server_plan中的dict转换为VMConfig对象
        plan_data = self.server_plan
        self.server_plan = {}
        for plan_name, plan_conf in plan_data.items():
            if isinstance(plan_conf, dict):
                self.server_plan[plan_name] = VMConfig(**plan_conf)
            elif isinstance(plan_conf, VMConfig):
                self.server_plan[plan_name] = plan_conf
        # 将system_maps/images_maps中的dict/兼容旧格式转换为OSConfig列表
        self.system_maps = self.__to_os_list__(self.system_maps)
        self.images_maps = self.__to_os_list__(self.images_maps, default_type="")

    # 将任意来源(list/dict/旧dict[str,list]/dict[str,str])统一转为list[OSConfig]
    @staticmethod
    def __to_os_list__(data, default_type: str = "") -> list:
        result: list = []
        if data is None:
            return result
        # 新结构: list
        if isinstance(data, list):
            for item in data:
                if isinstance(item, OSConfig):
                    result.append(item)
                elif isinstance(item, dict):
                    result.append(OSConfig(**item))
            return result
        # 旧结构兼容: dict
        if isinstance(data, dict):
            for name, val in data.items():
                if isinstance(val, list):
                    # 旧 system_maps: {name: [file, size]}
                    sys_file = val[0] if len(val) >= 1 else ""
                    sys_size = str(val[1]) if len(val) >= 2 else ""
                    result.append(OSConfig(sys_name=name, sys_file=sys_file,
                                           sys_size=sys_size, sys_type=default_type))
                elif isinstance(val, str):
                    # 旧 images_maps: {name: file}
                    result.append(OSConfig(sys_name=name, sys_file=val,
                                           sys_size="", sys_type=default_type))
                elif isinstance(val, dict):
                    val.setdefault("sys_name", name)
                    result.append(OSConfig(**val))
        return result

    # 读取数据 =================================
    def __read__(self, data: dict):
        for key, value in data.items():
            if hasattr(self, key):
                setattr(self, key, value)

    # 转换为字典 ===============================
    def __save__(self):
        return {
            "server_name": self.server_name,
            "server_type": self.server_type,
            "server_addr": self.server_addr,
            "server_user": self.server_user,
            "server_pass": self.server_pass,
            "server_port": self.server_port,
            "filter_name": self.filter_name,
            "images_path": self.images_path,
            "dvdrom_path": self.dvdrom_path,
            "system_path": self.system_path,
            "backup_path": self.backup_path,
            "extern_path": self.extern_path,
            "launch_path": self.launch_path,
            "network_nat": self.network_nat,
            "network_pub": self.network_pub,
            "i_kuai_addr": self.i_kuai_addr,
            "i_kuai_user": self.i_kuai_user,
            "i_kuai_pass": self.i_kuai_pass,
            "ports_start": self.ports_start,
            "ports_close": self.ports_close,
            "remote_port": self.remote_port,
            "limits_nums": self.limits_nums,
            "system_maps": [it.__save__() if isinstance(it, OSConfig) else it for it in (self.system_maps or [])],
            "images_maps": [it.__save__() if isinstance(it, OSConfig) else it for it in (self.images_maps or [])],
            "ipaddr_maps": self.ipaddr_maps,
            "ipaddr_ddns": self.ipaddr_ddns,
            "public_addr": self.public_addr,
            "extend_data": self.extend_data,
            "enable_host": self.enable_host,
            "server_area": self.server_area,
            "n_cpu_price": self.n_cpu_price,
            "n_mem_price": self.n_mem_price,
            "n_hdd_price": self.n_hdd_price,
            "n_net_price": self.n_net_price,
            "server_plan": {
                k: v.__save__() if hasattr(v, '__save__') and callable(getattr(v, '__save__')) else v
                for k, v in self.server_plan.items()
            },
            "n_cpu_price": self.n_cpu_price,
            "n_mem_price": self.n_mem_price,
            "n_hdd_price": self.n_hdd_price,
            "n_net_price": self.n_net_price,
        }

    # 转换为字符串 ===========================
    def __str__(self):
        return json.dumps(self.__save__())
