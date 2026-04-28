#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
OpenIDCS 多语言翻译生成器
使用 Google Translate API 自动生成多语言翻译文件
"""

import re
import os
import sys
import io
import time

# 修复Windows下GBK编码问题
if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')
from datetime import datetime
from typing import Dict, List, Tuple
from deep_translator import GoogleTranslator
from tqdm import tqdm

# 支持的语言映射 (文件名后缀 -> Google Translate 语言代码)
LANGUAGE_MAP = {
    'ar-ar': 'ar',  # 阿拉伯语
    'bn-bd': 'bn',  # 孟加拉语
    'de-de': 'de',  # 德语
    'en-us': 'en',  # 英语
    'es-es': 'es',  # 西班牙语
    'fr-fr': 'fr',  # 法语
    'hi-in': 'hi',  # 印地语
    'it-it': 'it',  # 意大利语
    'ja-jp': 'ja',  # 日语
    'ko-kr': 'ko',  # 韩语
    'pt-br': 'pt',  # 葡萄牙语
    'ru-ru': 'ru',  # 俄语
    'ur-pk': 'ur',  # 乌尔都语
    'zh-tw': 'zh-TW',  # 繁体中文
}

# 语言全称映射
LANGUAGE_NAMES = {
    'ar-ar': 'Arabic',
    'bn-bd': 'Bengali',
    'de-de': 'German',
    'en-us': 'English',
    'es-es': 'Spanish',
    'fr-fr': 'French',
    'hi-in': 'Hindi',
    'it-it': 'Italian',
    'ja-jp': 'Japanese',
    'ko-kr': 'Korean',
    'pt-br': 'Portuguese',
    'ru-ru': 'Russian',
    'ur-pk': 'Urdu',
    'zh-tw': 'Traditional Chinese',
}


class POFileTranslator:
    """PO文件翻译器"""
    
    def __init__(self, source_file: str):
        """
        初始化翻译器
        
        Args:
            source_file: 源PO文件路径 (zh-cn.po)
        """
        self.source_file = source_file
        self.entries: List[Tuple[str, str]] = []
        
    def parse_po_file(self) -> bool:
        """
        解析PO文件，提取msgid和msgstr对
        
        Returns:
            是否解析成功
        """
        try:
            with open(self.source_file, 'r', encoding='utf-8') as f:
                content = f.read()
            
            # 使用正则表达式提取 msgid 和 msgstr
            pattern = r'msgid\s+"([^"]*)"\s+msgstr\s+"([^"]*)"'
            matches = re.findall(pattern, content)
            
            # 过滤掉空的msgid（文件头）
            self.entries = [(msgid, msgstr) for msgid, msgstr in matches if msgid]
            
            print(f"✓ 成功解析 {len(self.entries)} 条翻译条目")
            return True
            
        except Exception as e:
            print(f"✗ 解析PO文件失败: {e}")
            return False
    
    def translate_text(self, text: str, target_lang: str, retry_count: int = 5) -> str:
        """
        翻译文本（带指数退避重试机制）
        """
        for attempt in range(retry_count):
            try:
                translator = GoogleTranslator(source='zh-CN', target=target_lang)
                result = translator.translate(text)
                return result
                
            except Exception as e:
                wait_time = (2 ** attempt) + 1  # 指数退避: 2, 3, 5, 9, 17秒
                if attempt < retry_count - 1:
                    time.sleep(wait_time)
                    continue
                else:
                    tqdm.write(f"  ⚠ 翻译失败 '{text[:30]}...' -> {target_lang}: {e}")
                    return text  # 翻译失败时返回原文
    
    def _parse_existing_po(self, output_file: str) -> Dict[str, str]:
        """解析已有的PO文件，返回已翻译的 {msgid: msgstr} 字典"""
        existing = {}
        if not os.path.exists(output_file):
            return existing
        try:
            with open(output_file, 'r', encoding='utf-8') as f:
                content = f.read()
            pattern = r'msgid\s+"([^"]*)"\s+msgstr\s+"([^"]*)"'
            matches = re.findall(pattern, content)
            for msgid, msgstr in matches:
                if msgid:  # 跳过空msgid（文件头）
                    existing[msgid] = msgstr
            print(f"  📂 发现已有翻译文件，包含 {len(existing)} 条已翻译条目")
        except Exception as e:
            print(f"  ⚠ 解析已有文件失败，将重新翻译: {e}")
        return existing

    def generate_po_file(self, target_lang_code: str, output_file: str) -> bool:
        """
        生成目标语言的PO文件（支持断点续传 + 批量翻译 + 指数退避重试）
        """
        try:
            # 获取语言名称
            lang_key = os.path.basename(output_file).replace('.po', '')
            lang_name = LANGUAGE_NAMES.get(lang_key, target_lang_code.upper())
            
            # 检查已有翻译（断点续传）
            existing_translations = self._parse_existing_po(output_file)
            
            # 确定需要翻译的条目（跳过已有的）
            entries_to_translate = []
            for msgid, msgstr in self.entries:
                if msgid in existing_translations:
                    continue  # 已翻译，跳过
                entries_to_translate.append((msgid, msgstr))
            
            if not entries_to_translate:
                print(f"\n✓ {lang_name} 已全部翻译完成，无需更新")
                return True
            
            print(f"\n  需要翻译: {len(entries_to_translate)}/{len(self.entries)} 条 (已有 {len(existing_translations)} 条)")
            
            # 生成文件头
            header = f"""# OpenIDCS {lang_name} Translation File
# Copyright (C) 2024 OpenIDCS Team
# This file is distributed under the same license as the OpenIDCS package.
#
msgid ""
msgstr ""
"Project-Id-Version: OpenIDCS 1.0\\n"
"Report-Msgid-Bugs-To: \\n"
"POT-Creation-Date: {datetime.now().strftime('%Y-%m-%d %H:%M')}\\n"
"PO-Revision-Date: {datetime.now().strftime('%Y-%m-%d %H:%M')}\\n"
"Last-Translator: Auto Generated\\n"
"Language-Team: {lang_name}\\n"
"Language: {target_lang_code}\\n"
"MIME-Version: 1.0\\n"
"Content-Type: text/plain; charset=UTF-8\\n"
"Content-Transfer-Encoding: 8bit\\n"

"""
            
            # 翻译待处理条目（小批量 + 重试）
            total = len(entries_to_translate)
            batch_size = 10  # 每批10条，避免触发限流
            max_retries = 5  # 最大重试次数
            new_translations = {}  # {msgid: translated_msgstr}
            
            print(f"\n开始翻译到 {lang_name} ({target_lang_code})...")
            
            # 使用tqdm显示进度条
            with tqdm(total=total, desc=f"翻译进度", unit="条", 
                     bar_format='{l_bar}{bar}| {n_fmt}/{total_fmt} [{elapsed}<{remaining}]') as pbar:
                
                for i in range(0, total, batch_size):
                    batch = entries_to_translate[i:i+batch_size]
                    batch_texts = [msgstr for _, msgstr in batch]
                    translated_batch = None
                    
                    # 指数退避重试
                    for attempt in range(max_retries):
                        try:
                            translator = GoogleTranslator(source='zh-CN', target=target_lang_code)
                            translated_batch = translator.translate_batch(batch_texts)
                            
                            # 验证结果
                            if translated_batch is None or len(translated_batch) != len(batch):
                                raise Exception(f"翻译结果数量不匹配: 期望{len(batch)}, 得到{len(translated_batch) if translated_batch else 0}")
                            break  # 成功则跳出重试循环
                            
                        except Exception as e:
                            wait_time = (2 ** attempt) + 1  # 2, 3, 5, 9, 17秒
                            if attempt < max_retries - 1:
                                tqdm.write(f"\n  ⚠ 批次 {i//batch_size+1} 翻译失败，{wait_time}秒后重试 ({attempt+1}/{max_retries}): {str(e)[:60]}")
                                time.sleep(wait_time)
                            else:
                                tqdm.write(f"\n  ✗ 批次 {i//batch_size+1} 翻译最终失败，使用逐条翻译")
                                # 最终失败时逐条翻译
                                translated_batch = []
                                for text in batch_texts:
                                    translated_batch.append(self.translate_text(text, target_lang_code))
                    
                    for j, (msgid, _) in enumerate(batch):
                        translated_text = translated_batch[j] if j < len(translated_batch) else batch_texts[j]
                        new_translations[msgid] = translated_text
                    
                    pbar.update(len(batch))
                    
                    # 每翻译100条保存一次进度（增量写入）
                    if (i + batch_size) % 100 == 0 or i + batch_size >= total:
                        self._save_progress(output_file, header, existing_translations, new_translations, self.entries)
                    
                    # 批次间休眠2秒，确保不超过5请求/秒限制
                    if i + batch_size < total:
                        time.sleep(2)
            
            # 最终写入完整文件
            self._save_progress(output_file, header, existing_translations, new_translations, self.entries)
            
            print(f"✓ 成功生成: {output_file}")
            return True
            
        except Exception as e:
            print(f"✗ 生成PO文件失败: {e}")
            return False

    def _save_progress(self, output_file: str, header: str, 
                       existing_translations: Dict[str, str],
                       new_translations: Dict[str, str],
                       all_entries: List[Tuple[str, str]]):
        """保存翻译进度到文件"""
        # 合并已有和新翻译
        merged = {**existing_translations, **new_translations}
        
        with open(output_file, 'w', encoding='utf-8') as f:
            f.write(header)
            for msgid, _ in all_entries:
                msgstr = merged.get(msgid, _)
                f.write(f'msgid "{msgid}"\n')
                f.write(f'msgstr "{msgstr}"\n\n')
    
    def generate_all_languages(self, output_dir: str = None) -> Dict[str, bool]:
        """
        生成所有语言的翻译文件
        
        Args:
            output_dir: 输出目录，默认为源文件所在目录
            
        Returns:
            各语言生成结果字典
        """
        if output_dir is None:
            output_dir = os.path.dirname(self.source_file)
        
        results = {}
        
        for lang_suffix, lang_code in LANGUAGE_MAP.items():
            output_file = os.path.join(output_dir, f"{lang_suffix}.po")
            success = self.generate_po_file(lang_code, output_file)
            results[lang_suffix] = success
        
        return results


def batch_generate_all(lang_key=None):
    """非交互式批量生成所有语言文件"""
    print("=" * 60)
    print("OpenIDCS 多语言翻译生成器 - 批量模式")
    print("=" * 60)
    
    # 获取脚本所在目录
    script_dir = os.path.dirname(os.path.abspath(__file__))
    source_file = os.path.join(script_dir, 'zh-cn.po')
    
    # 检查源文件是否存在
    if not os.path.exists(source_file):
        print(f"✗ 错误: 找不到源文件 {source_file}")
        sys.exit(1)
    
    print(f"\n源文件: {source_file}")
    
    # 创建翻译器
    translator = POFileTranslator(source_file)
    
    # 解析源文件
    if not translator.parse_po_file():
        sys.exit(1)
    
    # 确定要翻译的语言列表
    if lang_key and lang_key in LANGUAGE_MAP:
        langs_to_generate = {lang_key: LANGUAGE_MAP[lang_key]}
    else:
        langs_to_generate = LANGUAGE_MAP
    
    # 直接生成语言
    results = {}
    for suffix, code in langs_to_generate.items():
        output_file = os.path.join(script_dir, f"{suffix}.po")
        success = translator.generate_po_file(code, output_file)
        results[suffix] = success
    
    # 显示结果
    print("\n" + "=" * 60)
    success_count = sum(1 for v in results.values() if v)
    total_count = len(results)
    print(f"完成! 成功生成 {success_count}/{total_count} 个翻译文件")
    print("=" * 60)


def main():
    """主函数"""
    # 如果命令行参数包含 --all 或 -a，则直接批量生成
    if len(sys.argv) > 1 and sys.argv[1] in ('--all', '-a'):
        batch_generate_all()
        return
    
    # 如果命令行参数包含 --lang，则翻译指定语言
    if len(sys.argv) > 2 and sys.argv[1] == '--lang':
        batch_generate_all(sys.argv[2])
        return
    
    print("=" * 60)
    print("OpenIDCS 多语言翻译生成器")
    print("=" * 60)
    
    # 获取脚本所在目录
    script_dir = os.path.dirname(os.path.abspath(__file__))
    source_file = os.path.join(script_dir, 'zh-cn.po')
    
    # 检查源文件是否存在
    if not os.path.exists(source_file):
        print(f"✗ 错误: 找不到源文件 {source_file}")
        sys.exit(1)
    
    print(f"\n源文件: {source_file}")
    
    # 创建翻译器
    translator = POFileTranslator(source_file)
    
    # 解析源文件
    if not translator.parse_po_file():
        sys.exit(1)
    
    # 询问用户要生成哪些语言
    print("\n可用语言:")
    for idx, (suffix, name) in enumerate(LANGUAGE_NAMES.items(), 1):
        print(f"  {idx:2d}. {suffix:8s} - {name}")
    
    print("\n选项:")
    print("  - 输入语言编号（用逗号分隔，如: 1,3,5）")
    print("  - 输入 'all' 生成所有语言")
    print("  - 输入 'q' 退出")
    
    choice = input("\n请选择: ").strip().lower()
    
    if choice == 'q':
        print("已取消")
        sys.exit(0)
    
    # 确定要生成的语言
    if choice == 'all':
        selected_langs = list(LANGUAGE_MAP.keys())
    else:
        try:
            indices = [int(x.strip()) for x in choice.split(',')]
            lang_list = list(LANGUAGE_MAP.keys())
            selected_langs = [lang_list[i-1] for i in indices if 1 <= i <= len(lang_list)]
        except Exception as e:
            print(f"✗ 无效的输入: {e}")
            sys.exit(1)
    
    if not selected_langs:
        print("✗ 未选择任何语言")
        sys.exit(1)
    
    print(f"\n将生成 {len(selected_langs)} 个语言版本")
    
    # 生成翻译文件
    success_count = 0
    print(f"\n{'='*60}")
    print(f"开始批量翻译 {len(selected_langs)} 个语言")
    print(f"{'='*60}")
    
    for idx, lang_suffix in enumerate(selected_langs, 1):
        lang_code = LANGUAGE_MAP[lang_suffix]
        lang_name = LANGUAGE_NAMES[lang_suffix]
        output_file = os.path.join(script_dir, f"{lang_suffix}.po")
        
        print(f"\n[{idx}/{len(selected_langs)}] {lang_name} ({lang_suffix})")
        print("-" * 60)
        
        if translator.generate_po_file(lang_code, output_file):
            success_count += 1
            print(f"✓ 完成")
        else:
            print(f"✗ 失败")
    
    # 显示结果
    print("\n" + "=" * 60)
    print(f"完成! 成功生成 {success_count}/{len(selected_langs)} 个翻译文件")
    print("=" * 60)


if __name__ == '__main__':
    main()
