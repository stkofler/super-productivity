import {EntityState} from '@ngrx/entity';
import {Label, SingleDataSet} from 'ng2-charts';

export interface MetricCopy {
  // string date of day
  id: string;

  // used as id
  obstructions: string[];
  improvements: string[];
  improvementsTomorrow: string[];
  mood?: number;
  efficiency?: number;
}

export type Metric = Readonly<MetricCopy>;

export interface MetricState extends EntityState<Metric> {
}


export interface PieChartData {
  labels: Label[];
  data: SingleDataSet;
}
