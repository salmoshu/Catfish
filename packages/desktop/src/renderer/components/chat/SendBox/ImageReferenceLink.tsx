import { ipcBridge } from '@/common';
import { copyText } from '@/renderer/utils/ui/clipboard';
import { Dropdown, Image, Link, Menu, Message } from '@arco-design/web-react';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ImageReference } from './imageReferences';
import styles from './SendBox.module.css';

/** A draft image label with preview and an explicit copy-path context action. */
const ImageReferenceLink: React.FC<{ reference: ImageReference }> = ({ reference }) => {
  const { t } = useTranslation();
  const [preview, setPreview] = useState<string | null>(null);
  const showPreview = async () => {
    try {
      const image = await ipcBridge.fs.getImageBase64.invoke({ path: reference.path });
      if (!image) {
        Message.error(t('preview.missingFile.title'));
        return;
      }
      setPreview(image);
    } catch {
      Message.error(t('preview.missingFile.title'));
    }
  };
  return (
    <>
      <Dropdown
        trigger='contextMenu'
        droplist={
          <Menu>
            <Menu.Item
              key='copy-path'
              onClick={() => void copyText(reference.path).catch(() => Message.error(t('common.copyFailed')))}
            >
              {t('preview.copyPath')}
            </Menu.Item>
          </Menu>
        }
      >
        <Link
          role='link'
          tabIndex={0}
          className={styles.imageReference}
          title={reference.path}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => void showPreview()}
        >
          {reference.token}
        </Link>
      </Dropdown>
      {preview && <Image.Preview src={preview} visible onVisibleChange={(visible) => !visible && setPreview(null)} />}
    </>
  );
};

export default ImageReferenceLink;
