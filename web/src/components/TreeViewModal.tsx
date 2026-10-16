import React, { useEffect, useState } from 'react';
import { CardTreeNode, CardType } from '../types';
import { api } from '../api/client';
import {
  X,
  ChevronDown,
  ChevronRight,
  FolderTree,
  User,
  Clock,
  Layers,
  BookOpen,
  CheckSquare,
  Bug,
  ListTodo,
} from 'lucide-react';

interface TreeViewModalProps {
  isOpen: boolean;
  onClose: () => void;
  boardId: string;
  boardTitle: string;
  onSelectCard?: (cardId: string) => void;
}

const typeConfig: Record<CardType, { label: string; icon: React.ReactNode; color: string; bg: string }> = {
  EPIC: {
    label: 'Épico',
    icon: <Layers className="w-3.5 h-3.5 text-purple-400" />,
    color: 'text-purple-300',
    bg: 'bg-purple-500/10 border-purple-500/30',
  },
  STORY: {
    label: 'História',
    icon: <BookOpen className="w-3.5 h-3.5 text-emerald-400" />,
    color: 'text-emerald-300',
    bg: 'bg-emerald-500/10 border-emerald-500/30',
  },
  TASK: {
    label: 'Tarefa',
    icon: <CheckSquare className="w-3.5 h-3.5 text-blue-400" />,
    color: 'text-blue-300',
    bg: 'bg-blue-500/10 border-blue-500/30',
  },
  BUG: {
    label: 'Bug',
    icon: <Bug className="w-3.5 h-3.5 text-rose-400" />,
    color: 'text-rose-300',
    bg: 'bg-rose-500/10 border-rose-500/30',
  },
  SUBTASK: {
    label: 'Subtarefa',
    icon: <ListTodo className="w-3.5 h-3.5 text-slate-400" />,
    color: 'text-slate-300',
    bg: 'bg-slate-500/10 border-slate-500/30',
  },
};

interface TreeNodeItemProps {
  node: CardTreeNode;
  level: number;
  onSelectCard?: (cardId: string) => void;
}

const TreeNodeItem: React.FC<TreeNodeItemProps> = ({ node, level, onSelectCard }) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const typeCfg = typeConfig[node.type as CardType] || typeConfig.TASK;
  const hasChildren = node.children && node.children.length > 0;

  return (
    <div className="flex flex-col">
      <div
        className={`flex items-center gap-2 py-2 px-3 hover:bg-slate-800/60 rounded-xl transition group ${
          level > 0 ? 'border-l border-slate-800 ml-4' : ''
        }`}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 text-slate-400 hover:text-white rounded"
          >
            {isExpanded ? (
              <ChevronDown className="w-4 h-4 text-slate-400" />
            ) : (
              <ChevronRight className="w-4 h-4 text-slate-400" />
            )}
          </button>
        ) : (
          <span className="w-6" />
        )}

        <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-lg border text-xs font-semibold ${typeCfg.bg}`}>
          {typeCfg.icon}
          <span className={typeCfg.color}>{typeCfg.label}</span>
        </div>

        <button
          type="button"
          onClick={() => onSelectCard?.(node.id)}
          className="text-xs font-medium text-slate-200 hover:text-indigo-400 text-left flex-1 truncate"
          title={`Abrir detalhes de "${node.title}"`}
        >
          {node.title}
        </button>

        {node.column_title && (
          <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700/60">
            {node.column_title}
          </span>
        )}

        {node.estimate && (
          <span className="flex items-center gap-1 text-[11px] text-slate-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
            <Clock className="w-3 h-3 text-slate-500" />
            {node.estimate}
          </span>
        )}

        {node.assignee && (
          <span className="flex items-center gap-1 text-[11px] text-slate-300 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
            <User className="w-3 h-3 text-indigo-400" />
            {node.assignee}
          </span>
        )}
      </div>

      {hasChildren && isExpanded && (
        <div className="flex flex-col pl-4 space-y-1">
          {node.children.map((child: CardTreeNode) => (
            <TreeNodeItem
              key={child.id}
              node={child}
              level={level + 1}
              onSelectCard={onSelectCard}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export const TreeViewModal: React.FC<TreeViewModalProps> = ({
  isOpen,
  onClose,
  boardId,
  boardTitle,
  onSelectCard,
}) => {
  const [treeData, setTreeData] = useState<CardTreeNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && boardId) {
      loadTree();
    }
  }, [isOpen, boardId]);

  const loadTree = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getBoardTree(boardId);
      setTreeData(data);
    } catch (err: any) {
      setError(err.message || 'Falha ao carregar visão em árvore.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-900/60">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-500/10 rounded-xl text-indigo-400 border border-indigo-500/20">
              <FolderTree className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                Visão em Árvore
                <span className="text-xs font-normal text-slate-400">({boardTitle})</span>
              </h2>
              <p className="text-xs text-slate-400">
                Hierarquia completa de Épicos, Histórias, Tarefas e Subtarefas do quadro
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {loading && (
            <div className="py-16 text-center text-slate-400">
              <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-xs">Carregando hierarquia do quadro...</p>
            </div>
          )}

          {error && (
            <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300">
              {error}
            </div>
          )}

          {!loading && !error && treeData.length === 0 && (
            <div className="py-16 text-center text-slate-500">
              <FolderTree className="w-12 h-12 mx-auto mb-3 text-slate-600" />
              <p className="text-sm font-semibold text-slate-300">Nenhum cartão no quadro</p>
              <p className="text-xs text-slate-500 mt-1">
                Crie cartões com tipo Épico, História ou Tarefa para visualizar a hierarquia.
              </p>
            </div>
          )}

          {!loading && !error && treeData.length > 0 && (
            <div className="space-y-1">
              {treeData.map(rootNode => (
                <TreeNodeItem
                  key={rootNode.id}
                  node={rootNode}
                  level={0}
                  onSelectCard={cardId => {
                    onClose();
                    onSelectCard?.(cardId);
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
