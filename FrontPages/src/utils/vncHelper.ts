/**
 * 打开VNC控制台
 */
export function openVNCConsole(data: any, windowName: string) {
    const url: string = typeof data === 'string' ? data : (data?.url || data?.console_url || '')
    window.open(url, windowName, 'width=1024,height=768')
}
