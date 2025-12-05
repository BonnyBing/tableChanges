interface HeaderProps {
  onResetWorkspace: () => void
}

export const Header = ({ onResetWorkspace }: HeaderProps) => {
  return (
    <header className="page-header">
      <div>
        <p className="eyebrow">飞书多维表格助手</p>
        <h1>上传 · 映射 · 校验 · 一键复制</h1>
        <p className="subtitle">
          导入
          Excel/CSV，配置字段要求，实时编辑并校验数据，最后一键复制或导出成文档，直接粘贴进
          Excel、飞书多维表格或文档。
        </p>
      </div>
      <div className="header-actions">
        <button className="ghost-button" onClick={onResetWorkspace}>
          清空工作区
        </button>
        <a
          className="ghost-button"
          href="https://www.feishu.cn/hc"
          target="_blank"
          rel="noreferrer"
        >
          查看字段规范
        </a>
      </div>
    </header>
  )
}

