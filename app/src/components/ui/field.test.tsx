import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Field, useFieldControl } from './field';

/**
 * D-05 : « le caractère requis se dit au contrôle, pas seulement à l'œil ».
 * `Field` expose DEUX voies vers le contrôle — le render prop
 * `children({...})` et le contexte lu par `useFieldControl()`. Les deux
 * doivent porter `aria-required`, sinon la propriété ne voyage que par une
 * seule, et les appelants de l'autre voie restent muets pour le lecteur
 * d'écran alors que le formulaire, lui, refuse la soumission.
 */
describe('Field — le caractère requis voyage par les deux voies', () => {
  it('un champ requis porte aria-required par le render prop', () => {
    render(<Field label="Nom">{props => <input {...props} />}</Field>);

    expect(screen.getByLabelText(/^Nom/)).toHaveAttribute('aria-required', 'true');
  });

  it('un champ optionnel ne porte pas aria-required', () => {
    render(
      <Field label="Nom" optional>
        {props => <input {...props} />}
      </Field>,
    );

    expect(screen.getByLabelText(/^Nom/)).not.toHaveAttribute('aria-required');
  });

  it('un champ requis porte aria-required par useFieldControl()', () => {
    function ControlFromContext() {
      const props = useFieldControl();
      return <input {...props} />;
    }

    render(<Field label="Nom">{() => <ControlFromContext />}</Field>);

    expect(screen.getByLabelText(/^Nom/)).toHaveAttribute('aria-required', 'true');
  });
});
