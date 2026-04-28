class OSConfig:
    def __init__(self, **kwargs):
        self.sys_name: str = "" # 镜像-系统显示名称
        self.sys_file: str = "" # 镜像-文件存储名称
        self.sys_size: str = "" # 允许最低磁盘值-GB
        self.sys_type: str = "" # WinNT/Linux/macOS
        self.sys_flag: bool = True # 是否启用此镜像
        self.__load__(**kwargs)

    def __save__(self):
        return {
            "sys_name": self.sys_name,
            "sys_file": self.sys_file,
            "sys_size": self.sys_size,
            "sys_type": self.sys_type,
            "sys_flag": self.sys_flag,
        }

    # 加载数据 ===============================
    def __load__(self, **kwargs):
        for key, value in kwargs.items():
            if hasattr(self, key):
                # sys_flag 兼容 bool / "true"/"false" / 1/0 等
                if key == "sys_flag":
                    if isinstance(value, bool):
                        setattr(self, key, value)
                    elif isinstance(value, (int, float)):
                        setattr(self, key, bool(value))
                    elif isinstance(value, str):
                        setattr(self, key, value.strip().lower() not in ("", "0", "false", "no", "off"))
                    else:
                        setattr(self, key, True)
                else:
                    setattr(self, key, value)